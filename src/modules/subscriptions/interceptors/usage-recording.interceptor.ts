import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from '../subscriptions.service';
import {
  REQUIRES_LIMIT_KEY,
  RequiresLimitMetadata,
} from '../subscription.constants';

/**
 * Backs @RequiresLimit's "count only on success" half. Runs after the
 * handler; `tap` only fires on a successful emission, so a thrown/rejected
 * business operation (e.g. a failed template save) never increments usage.
 * The actual increment is a single atomic upsert in UsageService, so
 * concurrent requests can't race each other into an incorrect count. For
 * standing-cap resource limits (no period) SubscriptionsService.recordUsage
 * is a no-op - those are counted live from the resource table, not here.
 */
@Injectable()
export class UsageRecordingInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<
      RequiresLimitMetadata | undefined
    >(REQUIRES_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return next.handle().pipe(
      tap(() => {
        void this.subscriptionsService.recordUsage(
          request.user.userId,
          metadata.featureKey,
        );
      }),
    );
  }
}
