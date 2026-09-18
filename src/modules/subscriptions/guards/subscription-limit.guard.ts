import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from '../subscriptions.service';
import { SubscriptionDeniedException } from '../exceptions/subscription-denied.exception';
import { ResourceCountResolver } from '../interfaces/resource-count-resolver.interface';
import {
  REQUIRES_LIMIT_KEY,
  RequiresLimitMetadata,
} from '../subscription.constants';

/**
 * Backs @RequiresLimit. Runs the pre-check only - it decides whether the
 * request may proceed, but never increments usage (that's
 * UsageRecordingInterceptor's job, which only fires after the handler
 * actually succeeds). Must run after JwtAuthGuard.
 */
@Injectable()
export class SubscriptionLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<
      RequiresLimitMetadata | undefined
    >(REQUIRES_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    let currentCount: number | undefined;
    if (metadata.resolver) {
      const resolver = this.moduleRef.get<ResourceCountResolver>(
        metadata.resolver,
        { strict: false },
      );
      const resolved = await resolver.resolveCurrentCount(request);
      if (resolved === null) {
        // Not a new-resource request (e.g. an update via an upsert endpoint) - nothing to cap.
        return true;
      }
      currentCount = resolved;
    }

    const result = await this.subscriptionsService.checkLimit(
      request.user.userId,
      metadata.featureKey,
      currentCount === undefined ? {} : { currentCount },
    );

    if (!result.allowed) {
      throw new SubscriptionDeniedException(result);
    }
    return true;
  }
}
