import { SubscriptionsService } from './subscriptions.service';
import { UserSubscription } from './models/user-subscription.model';
import { PlansService } from '../plans/plans.service';
import { UsageService } from '../usage/usage.service';
import { UsagePeriodType } from '../usage/models/usage-counter.model';
import {
  PlanFeatureValueType,
  PlanFeaturePeriod,
} from '../plans/models/plan-feature.model';
import { EntitlementReason } from './entitlement.types';

function feature(overrides: Record<string, unknown> = {}) {
  return {
    featureKey: 'some.feature',
    valueType: PlanFeatureValueType.BOOLEAN,
    boolValue: null,
    limitValue: null,
    isUnlimited: false,
    period: null,
    ...overrides,
  };
}

function makeService(options: {
  planCode?: string | null;
  features?: ReturnType<typeof feature>[];
  usage?: number;
}) {
  const subscription =
    options.planCode === null
      ? null
      : {
          plan: {
            code: options.planCode ?? 'FREE',
            features: options.features ?? [],
          },
        };

  const subscriptionModel = {
    findOne: jest.fn().mockResolvedValue(subscription),
  } as unknown as typeof UserSubscription;

  const plansService = {} as PlansService;

  const usageService = {
    getUsage: jest.fn().mockResolvedValue(options.usage ?? 0),
    currentPeriodKey: jest.fn().mockReturnValue('2026-09-18'),
    incrementUsage: jest.fn().mockResolvedValue(1),
  } as unknown as UsageService;

  const service = new SubscriptionsService(
    subscriptionModel,
    plansService,
    usageService,
  );
  return { service, usageService, subscriptionModel };
}

describe('SubscriptionsService entitlement engine', () => {
  it('allows a boolean feature that is enabled on the plan', async () => {
    const { service } = makeService({
      planCode: 'FREE',
      features: [feature({ featureKey: 'template.export', boolValue: true })],
    });

    const result = await service.canUse('user-1', 'template.export');

    expect(result).toMatchObject({
      allowed: true,
      reason: EntitlementReason.ALLOWED,
    });
  });

  it('denies a boolean feature that is disabled on the plan (Free)', async () => {
    const { service } = makeService({
      planCode: 'FREE',
      features: [feature({ featureKey: 'marketplace.sync', boolValue: false })],
    });

    const result = await service.canUse('user-1', 'marketplace.sync');

    expect(result).toMatchObject({
      allowed: false,
      reason: EntitlementReason.FEATURE_DISABLED,
    });
  });

  it('allows a boolean feature that is enabled on a higher plan (Pro)', async () => {
    const { service } = makeService({
      planCode: 'PRO',
      features: [feature({ featureKey: 'marketplace.sync', boolValue: true })],
    });

    const result = await service.canUse('user-1', 'marketplace.sync');

    expect(result).toMatchObject({
      allowed: true,
      reason: EntitlementReason.ALLOWED,
    });
  });

  it('denies (safe default) when the plan has no configuration for the feature at all', async () => {
    const { service } = makeService({ planCode: 'FREE', features: [] });

    const result = await service.canUse('user-1', 'never.configured');

    expect(result).toMatchObject({
      allowed: false,
      reason: EntitlementReason.FEATURE_NOT_CONFIGURED,
    });
  });

  it('allows a daily limit that has not been reached yet', async () => {
    const { service, usageService } = makeService({
      planCode: 'FREE',
      features: [
        feature({
          featureKey: 'listing.create',
          valueType: PlanFeatureValueType.LIMIT,
          limitValue: 50,
          period: PlanFeaturePeriod.DAILY,
        }),
      ],
      usage: 37,
    });

    const result = await service.checkLimit('user-1', 'listing.create');

    expect(result).toMatchObject({
      allowed: true,
      reason: EntitlementReason.ALLOWED,
      limit: 50,
      used: 37,
      remaining: 13,
      period: PlanFeaturePeriod.DAILY,
    });
    expect(usageService.currentPeriodKey).toHaveBeenCalledWith(
      UsagePeriodType.DAILY,
    );
  });

  it('rejects once a daily limit has been reached', async () => {
    const { service } = makeService({
      planCode: 'FREE',
      features: [
        feature({
          featureKey: 'listing.create',
          valueType: PlanFeatureValueType.LIMIT,
          limitValue: 50,
          period: PlanFeaturePeriod.DAILY,
        }),
      ],
      usage: 50,
    });

    const result = await service.checkLimit('user-1', 'listing.create');

    expect(result).toMatchObject({
      allowed: false,
      reason: EntitlementReason.LIMIT_REACHED,
      limit: 50,
      used: 50,
      remaining: 0,
    });
  });

  it('resolves a monthly limit against the monthly usage period', async () => {
    const { service, usageService } = makeService({
      planCode: 'PRO',
      features: [
        feature({
          featureKey: 'product.research',
          valueType: PlanFeatureValueType.LIMIT,
          limitValue: 100,
          period: PlanFeaturePeriod.MONTHLY,
        }),
      ],
      usage: 99,
    });

    const result = await service.checkLimit('user-1', 'product.research');

    expect(result).toMatchObject({
      allowed: true,
      reason: EntitlementReason.ALLOWED,
      remaining: 1,
      period: PlanFeaturePeriod.MONTHLY,
    });
    expect(usageService.currentPeriodKey).toHaveBeenCalledWith(
      UsagePeriodType.MONTHLY,
    );
  });

  it('treats isUnlimited as always allowed, with no numeric limit reported', async () => {
    const { service } = makeService({
      planCode: 'ROCKET',
      features: [
        feature({
          featureKey: 'product.research',
          valueType: PlanFeatureValueType.LIMIT,
          isUnlimited: true,
          period: PlanFeaturePeriod.MONTHLY,
        }),
      ],
    });

    const result = await service.checkLimit('user-1', 'product.research');

    expect(result).toMatchObject({
      allowed: true,
      reason: EntitlementReason.UNLIMITED,
      limit: null,
    });
  });

  it('denies with NO_ACTIVE_SUBSCRIPTION when the user has no active subscription', async () => {
    const { service } = makeService({ planCode: null });

    const canUseResult = await service.canUse('user-1', 'marketplace.sync');
    const checkLimitResult = await service.checkLimit(
      'user-1',
      'listing.create',
    );

    expect(canUseResult.reason).toBe(EntitlementReason.NO_ACTIVE_SUBSCRIPTION);
    expect(checkLimitResult.reason).toBe(
      EntitlementReason.NO_ACTIVE_SUBSCRIPTION,
    );
  });

  it('resolves a standing-cap resource limit from the caller-supplied count, not UsageService', async () => {
    const { service, usageService } = makeService({
      planCode: 'FREE',
      features: [
        feature({
          featureKey: 'template.create',
          valueType: PlanFeatureValueType.LIMIT,
          limitValue: 5,
          period: null,
        }),
      ],
    });

    const underLimit = await service.checkLimit('user-1', 'template.create', {
      currentCount: 3,
    });
    const atLimit = await service.checkLimit('user-1', 'template.create', {
      currentCount: 5,
    });

    expect(underLimit).toMatchObject({
      allowed: true,
      used: 3,
      remaining: 2,
      period: null,
    });
    expect(atLimit).toMatchObject({
      allowed: false,
      reason: EntitlementReason.LIMIT_REACHED,
      used: 5,
      remaining: 0,
    });
    // A resource limit (no period) must never ask UsageService for a count.
    expect(usageService.getUsage).not.toHaveBeenCalled();
  });

  it('reports current usage for a period-based limit via getUsage', async () => {
    const { service, usageService } = makeService({
      planCode: 'FREE',
      features: [
        feature({
          featureKey: 'listing.create',
          valueType: PlanFeatureValueType.LIMIT,
          limitValue: 50,
          period: PlanFeaturePeriod.DAILY,
        }),
      ],
      usage: 12,
    });

    const result = await service.checkLimit('user-1', 'listing.create');

    expect(usageService.getUsage).toHaveBeenCalledWith(
      'user-1',
      'listing.create',
      UsagePeriodType.DAILY,
      '2026-09-18',
    );
    expect(result.used).toBe(12);
  });

  describe('recordUsage', () => {
    it('increments usage for a period-based limit feature', async () => {
      const { service, usageService } = makeService({
        planCode: 'FREE',
        features: [
          feature({
            featureKey: 'listing.create',
            valueType: PlanFeatureValueType.LIMIT,
            limitValue: 50,
            period: PlanFeaturePeriod.DAILY,
          }),
        ],
      });

      await service.recordUsage('user-1', 'listing.create');

      expect(usageService.incrementUsage).toHaveBeenCalledWith(
        'user-1',
        'listing.create',
        UsagePeriodType.DAILY,
        '2026-09-18',
      );
    });

    it('does nothing for a standing-cap resource limit (nothing to increment)', async () => {
      const { service, usageService } = makeService({
        planCode: 'FREE',
        features: [
          feature({
            featureKey: 'template.create',
            valueType: PlanFeatureValueType.LIMIT,
            limitValue: 5,
            period: null,
          }),
        ],
      });

      await service.recordUsage('user-1', 'template.create');

      expect(usageService.incrementUsage).not.toHaveBeenCalled();
    });

    it('does nothing for a boolean feature', async () => {
      const { service, usageService } = makeService({
        planCode: 'FREE',
        features: [
          feature({ featureKey: 'marketplace.sync', boolValue: true }),
        ],
      });

      await service.recordUsage('user-1', 'marketplace.sync');

      expect(usageService.incrementUsage).not.toHaveBeenCalled();
    });
  });
});
