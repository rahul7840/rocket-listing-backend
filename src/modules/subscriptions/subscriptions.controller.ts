import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { SubscriptionsService } from './subscriptions.service';
import { PlanFeatureValueType } from '../plans/models/plan-feature.model';

/**
 * Self-service "my plan" view for the website dashboard. Everything here is
 * a read of data SubscriptionsService already computes internally for
 * entitlement checks (getCurrentSubscription/checkLimit) - no new billing or
 * plan-selection logic lives here (see docs/phase-6-payment-plan.md: no
 * payment gateway integration exists yet).
 */
@Controller('subscriptions')
@ApiTags('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  async me(@CurrentUser() user: User) {
    const subscription = await this.subscriptionsService.getCurrentSubscription(
      user.userId,
    );

    if (!subscription || !subscription.plan) {
      return { plan: null, subscription: null, features: [] };
    }

    const plan = subscription.plan;
    const features = await Promise.all(
      (plan.features ?? []).map(async (feature) => {
        if (feature.valueType === PlanFeatureValueType.BOOLEAN) {
          const result = await this.subscriptionsService.canUse(
            user.userId,
            feature.featureKey,
          );
          return {
            featureKey: feature.featureKey,
            valueType: feature.valueType,
            enabled: result.allowed,
            limit: null,
            used: null,
            remaining: null,
            period: null,
          };
        }

        const result = await this.subscriptionsService.checkLimit(
          user.userId,
          feature.featureKey,
        );
        return {
          featureKey: feature.featureKey,
          valueType: feature.valueType,
          enabled: true,
          limit: feature.isUnlimited ? null : result.limit,
          used: result.used,
          remaining: result.remaining,
          period: result.period,
          unlimited: feature.isUnlimited,
        };
      }),
    );

    return {
      plan: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
      },
      subscription: {
        status: subscription.status,
        startedAt: subscription.startedAt,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      features,
    };
  }
}
