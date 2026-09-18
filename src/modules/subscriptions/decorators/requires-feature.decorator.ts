import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { SubscriptionFeatureGuard } from '../guards/subscription-feature.guard';
import { REQUIRES_FEATURE_KEY } from '../subscription.constants';

/**
 * Declares that a route requires a boolean-style plan feature to be enabled
 * (e.g. "marketplace.sync"). The decorator only records which feature is
 * required; SubscriptionFeatureGuard does the actual check against the
 * user's current plan. Must be used on a route that already runs
 * JwtAuthGuard (controller-level guards run before method-level ones), so
 * request.user is populated by the time this guard runs.
 */
export const RequiresFeature = (featureKey: string) =>
  applyDecorators(
    SetMetadata(REQUIRES_FEATURE_KEY, featureKey),
    UseGuards(SubscriptionFeatureGuard),
  );
