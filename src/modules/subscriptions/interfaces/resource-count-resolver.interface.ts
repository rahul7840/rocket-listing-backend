import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';

/**
 * How a business module tells SubscriptionLimitGuard the current count for a
 * standing-cap resource limit (e.g. "how many templates does this user
 * already have"). SubscriptionsService/the guard have no idea what a
 * "template" is - that stays in the owning module, implemented as one of
 * these and passed to @RequiresLimit.
 *
 * Return `null` to skip the limit check entirely for this request (e.g. an
 * upsert endpoint where this particular call is an update to an existing
 * resource, not the creation of a new one).
 */
export interface ResourceCountResolver {
  resolveCurrentCount(
    request: AuthenticatedRequest,
  ): Promise<number | null> | number | null;
}
