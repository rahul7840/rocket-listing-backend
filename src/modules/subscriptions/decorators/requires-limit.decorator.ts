import {
  applyDecorators,
  SetMetadata,
  Type,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SubscriptionLimitGuard } from '../guards/subscription-limit.guard';
import { UsageRecordingInterceptor } from '../interceptors/usage-recording.interceptor';
import { ResourceCountResolver } from '../interfaces/resource-count-resolver.interface';
import {
  REQUIRES_LIMIT_KEY,
  RequiresLimitMetadata,
} from '../subscription.constants';

/**
 * Declares that a route consumes one unit of a LIMIT plan feature (e.g.
 * "listing.create" at 50/day, or "template.create" at a standing cap of 5).
 * Wires up both halves of enforcement:
 *  - SubscriptionLimitGuard rejects the request up front if the limit is
 *    already reached.
 *  - UsageRecordingInterceptor records one unit of usage, but only after the
 *    handler completes successfully.
 * The decorator itself does no checking - it just declares what's required.
 */
export const RequiresLimit = (
  featureKey: string,
  resolver?: Type<ResourceCountResolver>,
) =>
  applyDecorators(
    SetMetadata(REQUIRES_LIMIT_KEY, {
      featureKey,
      resolver,
    } satisfies RequiresLimitMetadata),
    UseGuards(SubscriptionLimitGuard),
    UseInterceptors(UsageRecordingInterceptor),
  );
