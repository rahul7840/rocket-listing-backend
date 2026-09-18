import { PlanFeaturePeriod } from '../plans/models/plan-feature.model';

/**
 * Why an entitlement check came out the way it did. ALLOWED/UNLIMITED mean
 * the operation may proceed; every other value means it may not. Kept as
 * explicit strings (not booleans/magic numbers) so callers - and the HTTP
 * layer in Phase 5 - can act on a stable, named reason instead of guessing.
 */
export enum EntitlementReason {
  ALLOWED = 'ALLOWED',
  UNLIMITED = 'UNLIMITED',
  FEATURE_DISABLED = 'FEATURE_DISABLED',
  LIMIT_REACHED = 'LIMIT_REACHED',
  NO_ACTIVE_SUBSCRIPTION = 'NO_ACTIVE_SUBSCRIPTION',
  FEATURE_NOT_CONFIGURED = 'FEATURE_NOT_CONFIGURED',
}

/**
 * The structured outcome of an entitlement check - what every
 * SubscriptionsService.canUse/checkLimit call returns. `allowed` is what
 * callers branch on; the rest is context for logging, API error bodies, and
 * "X of Y used" UI in the extension.
 */
export interface EntitlementResult {
  allowed: boolean;
  featureKey: string;
  reason: EntitlementReason;
  /** null when the feature is boolean-only, not configured, or unlimited. */
  limit: number | null;
  /** null when there's nothing to count (boolean features, or checks that never resolved a count). */
  used: number | null;
  /** null when unlimited or not applicable. */
  remaining: number | null;
  /** null for boolean features and for standing (non-resetting) limits. */
  period: PlanFeaturePeriod | null;
}
