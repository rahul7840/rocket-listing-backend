import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';
import { EntitlementReason } from '../entitlement.types';
import { SubscriptionDeniedException } from '../exceptions/subscription-denied.exception';
import { SubscriptionsService } from '../subscriptions.service';

/** The plan code every user starts on; any other active plan (Pro, Max, Rocket) is a paid one. */
export const FREE_PLAN_CODE = 'FREE';

/**
 * Backs @RequiresPaidPlan. Must run after JwtAuthGuard. Decided from the user's current plan alone (the same plan
 * GET /subscriptions/me reports), so a lapsed Pro drops back to Free here too.
 */
@Injectable()
export class PaidPlanGuard implements CanActivate {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const subscription = await this.subscriptionsService.getCurrentSubscription(
      request.user.userId,
    );
    const code = subscription?.plan?.code;
    if (code && code !== FREE_PLAN_CODE) {
      return true;
    }
    throw new SubscriptionDeniedException({
      allowed: false,
      featureKey: 'paid-plan',
      reason: code
        ? EntitlementReason.FEATURE_DISABLED
        : EntitlementReason.NO_ACTIVE_SUBSCRIPTION,
      limit: null,
      used: null,
      remaining: null,
      period: null,
    });
  }
}
