import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from '../subscriptions.service';
import { SubscriptionDeniedException } from '../exceptions/subscription-denied.exception';
import { REQUIRES_FEATURE_KEY } from '../subscription.constants';

/**
 * Backs @RequiresFeature. Must run after JwtAuthGuard (which populates
 * request.user) - it never trusts anything the client sends about its own
 * plan, only what SubscriptionsService resolves from the database.
 */
@Injectable()
export class SubscriptionFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!featureKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const result = await this.subscriptionsService.canUse(
      request.user.userId,
      featureKey,
    );

    if (!result.allowed) {
      throw new SubscriptionDeniedException(result);
    }
    return true;
  }
}
