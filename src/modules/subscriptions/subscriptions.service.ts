import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  UserSubscription,
  SubscriptionStatus,
  SubscriptionSource,
} from './models/user-subscription.model';
import { Plan } from '../plans/models/plan.model';
import {
  PlanFeature,
  PlanFeaturePeriod,
  PlanFeatureValueType,
} from '../plans/models/plan-feature.model';
import { PlansService } from '../plans/plans.service';
import { UsageService } from '../usage/usage.service';
import { UsagePeriodType } from '../usage/models/usage-counter.model';
import { EntitlementReason, EntitlementResult } from './entitlement.types';

export interface AssignPlanOptions {
  /** Optional billing/period window for the new subscription; omit for an open-ended assignment (e.g. Free, or an admin grant with no expiry). */
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

export interface CheckLimitOptions {
  /**
   * Current count for a standing-cap resource limit (valueType = LIMIT,
   * period = null), e.g. "how many templates does this user already have".
   * Callers own their own resource counting - SubscriptionsService has no
   * idea what a "template" is. Ignored for period-based (daily/monthly)
   * limits, which are resolved from UsageService instead.
   */
  currentCount?: number;
}

const emptyResult = (
  featureKey: string,
  reason: EntitlementReason,
): EntitlementResult => ({
  allowed: false,
  featureKey,
  reason,
  limit: null,
  used: null,
  remaining: null,
  period: null,
});

/**
 * Resolves and mutates which plan a user is on, and - the entitlement
 * engine - decides whether a user may use a given feature right now. This is
 * meant to be the single place any Rocket Listing module asks "can this user
 * do X", instead of hardcoding per-plan logic (`if (plan === 'FREE')`)
 * anywhere else in the codebase.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(UserSubscription)
    private readonly subscriptionModel: typeof UserSubscription,
    private readonly plansService: PlansService,
    private readonly usageService: UsageService,
  ) {}

  /** The user's single current ACTIVE subscription row, if any. */
  async getCurrentSubscription(
    userId: string,
  ): Promise<UserSubscription | null> {
    return this.subscriptionModel.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      include: [{ model: Plan, include: [PlanFeature] }],
    });
  }

  /** The plan (with its features) behind the user's current active subscription, if any. */
  async getCurrentPlan(userId: string): Promise<Plan | null> {
    const subscription = await this.getCurrentSubscription(userId);
    return subscription?.plan ?? null;
  }

  /** Full subscription history for a user, newest first. */
  async getHistory(userId: string): Promise<UserSubscription[]> {
    return this.subscriptionModel.findAll({
      where: { userId },
      include: [Plan],
      order: [['startedAt', 'DESC']],
    });
  }

  /**
   * Puts a user on the given plan: closes their current active subscription
   * (if any) and creates a new active one. Used both for the initial Free
   * grant and for admin-driven plan changes - the old row is kept, never
   * deleted, so plan history is preserved.
   */
  async assignPlan(
    userId: string,
    planCode: string,
    source: SubscriptionSource,
    options: AssignPlanOptions = {},
  ): Promise<UserSubscription> {
    const plan = await this.plansService.findByCode(planCode);
    if (!plan) {
      throw new NotFoundException(`Plan ${planCode} not found`);
    }

    return this.subscriptionModel.sequelize!.transaction(
      async (transaction) => {
        const now = new Date();
        const current = await this.subscriptionModel.findOne({
          where: { userId, status: SubscriptionStatus.ACTIVE },
          transaction,
        });

        if (current) {
          await current.update(
            {
              status: SubscriptionStatus.CANCELLED,
              currentPeriodEnd: current.currentPeriodEnd ?? now,
            },
            { transaction },
          );
        }

        return this.subscriptionModel.create(
          {
            userId,
            planId: plan.planId,
            status: SubscriptionStatus.ACTIVE,
            startedAt: now,
            currentPeriodStart: options.currentPeriodStart ?? null,
            currentPeriodEnd: options.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: false,
            source,
          },
          { transaction },
        );
      },
    );
  }

  /**
   * Ends the user's current active subscription without starting a
   * replacement, leaving them with no active plan.
   */
  async expireSubscription(userId: string): Promise<UserSubscription | null> {
    const current = await this.subscriptionModel.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });
    if (!current) {
      return null;
    }

    return current.update({
      status: SubscriptionStatus.EXPIRED,
      currentPeriodEnd: current.currentPeriodEnd ?? new Date(),
    });
  }

  /**
   * Called on first sign-in: gives a user with no subscription history at
   * all the Free plan. A no-op for anyone who already has one (including
   * someone whose only subscription has already lapsed), so it's safe to
   * call on every login.
   */
  async assignFreePlanIfMissing(userId: string): Promise<void> {
    const hasAnySubscription = await this.subscriptionModel.findOne({
      where: { userId },
    });
    if (hasAnySubscription) {
      return;
    }

    await this.assignPlan(userId, 'FREE', SubscriptionSource.SYSTEM);
  }

  /**
   * The plan feature row backing `featureKey` for a user's current plan, if
   * any. Resolved from the user's active subscription -> plan -> plan
   * features, always live from the database - never from anything the
   * client sends.
   */
  async getFeatureConfig(
    userId: string,
    featureKey: string,
  ): Promise<{ plan: Plan; feature: PlanFeature | null } | null> {
    const plan = await this.getCurrentPlan(userId);
    if (!plan) {
      return null;
    }
    const feature =
      plan.features?.find((f) => f.featureKey === featureKey) ?? null;
    return { plan, feature };
  }

  /**
   * Is this feature available to the user at all? Meant for boolean-style
   * gates (e.g. "marketplace.sync"). For LIMIT features this only answers
   * "is the feature switched on for this plan" (UNLIMITED, or ALLOWED
   * because a limit exists but hasn't been evaluated) - whether the user has
   * hit their limit is checkLimit's job, not this one.
   */
  async canUse(userId: string, featureKey: string): Promise<EntitlementResult> {
    const config = await this.getFeatureConfig(userId, featureKey);
    if (!config) {
      return emptyResult(featureKey, EntitlementReason.NO_ACTIVE_SUBSCRIPTION);
    }
    const { feature } = config;
    if (!feature) {
      return emptyResult(featureKey, EntitlementReason.FEATURE_NOT_CONFIGURED);
    }

    if (feature.valueType === PlanFeatureValueType.BOOLEAN) {
      const allowed = feature.boolValue === true;
      return {
        allowed,
        featureKey,
        reason: allowed
          ? EntitlementReason.ALLOWED
          : EntitlementReason.FEATURE_DISABLED,
        limit: null,
        used: null,
        remaining: null,
        period: null,
      };
    }

    // LIMIT feature: "can use" just means the feature exists on this plan.
    if (feature.isUnlimited) {
      return {
        allowed: true,
        featureKey,
        reason: EntitlementReason.UNLIMITED,
        limit: null,
        used: null,
        remaining: null,
        period: feature.period,
      };
    }
    return {
      allowed: true,
      featureKey,
      reason: EntitlementReason.ALLOWED,
      limit: feature.limitValue,
      used: null,
      remaining: null,
      period: feature.period,
    };
  }

  /**
   * Can the user consume one more unit of a LIMIT feature right now?
   * Combines the plan's configured limit with either:
   *  - a caller-supplied resource count (`options.currentCount`), for
   *    standing caps like "max 5 templates" that count existing rows, or
   *  - UsageService, for period-based limits like "50 listings/day".
   * A boolean feature is treated as having no numeric limit: LIMIT_REACHED
   * never applies to it, only FEATURE_DISABLED/ALLOWED.
   */
  async checkLimit(
    userId: string,
    featureKey: string,
    options: CheckLimitOptions = {},
  ): Promise<EntitlementResult> {
    const config = await this.getFeatureConfig(userId, featureKey);
    if (!config) {
      return emptyResult(featureKey, EntitlementReason.NO_ACTIVE_SUBSCRIPTION);
    }
    const { feature } = config;
    if (!feature) {
      return emptyResult(featureKey, EntitlementReason.FEATURE_NOT_CONFIGURED);
    }

    if (feature.valueType === PlanFeatureValueType.BOOLEAN) {
      const allowed = feature.boolValue === true;
      return {
        allowed,
        featureKey,
        reason: allowed
          ? EntitlementReason.ALLOWED
          : EntitlementReason.FEATURE_DISABLED,
        limit: null,
        used: null,
        remaining: null,
        period: null,
      };
    }

    if (feature.isUnlimited) {
      return {
        allowed: true,
        featureKey,
        reason: EntitlementReason.UNLIMITED,
        limit: null,
        used: null,
        remaining: null,
        period: feature.period,
      };
    }

    const limit = feature.limitValue ?? 0;
    const used = feature.period
      ? await this.usageService.getUsage(
          userId,
          featureKey,
          this.toUsagePeriodType(feature.period),
          this.usageService.currentPeriodKey(
            this.toUsagePeriodType(feature.period),
          ),
        )
      : (options.currentCount ?? 0);

    const remaining = Math.max(limit - used, 0);
    const allowed = used < limit;
    return {
      allowed,
      featureKey,
      reason: allowed
        ? EntitlementReason.ALLOWED
        : EntitlementReason.LIMIT_REACHED,
      limit,
      used,
      remaining,
      period: feature.period,
    };
  }

  /**
   * Records one unit of consumption for a period-based LIMIT feature (e.g.
   * "listing.create" at 50/day) after the protected operation has already
   * succeeded. A no-op for boolean features and for standing-cap resource
   * limits (period = null) - those are counted live from the resource table
   * itself, so there's nothing to increment here.
   */
  async recordUsage(userId: string, featureKey: string): Promise<void> {
    const config = await this.getFeatureConfig(userId, featureKey);
    const feature = config?.feature;
    if (
      !feature ||
      feature.valueType !== PlanFeatureValueType.LIMIT ||
      feature.isUnlimited ||
      !feature.period
    ) {
      return;
    }

    const periodType = this.toUsagePeriodType(feature.period);
    const periodKey = this.usageService.currentPeriodKey(periodType);
    await this.usageService.incrementUsage(
      userId,
      featureKey,
      periodType,
      periodKey,
    );
  }

  private toUsagePeriodType(period: PlanFeaturePeriod): UsagePeriodType {
    return period === PlanFeaturePeriod.DAILY
      ? UsagePeriodType.DAILY
      : UsagePeriodType.MONTHLY;
  }
}
