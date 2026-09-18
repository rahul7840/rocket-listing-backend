import { HttpException, HttpStatus } from '@nestjs/common';
import { EntitlementResult } from '../entitlement.types';

/**
 * Thrown by the subscription guards when EntitlementResult.allowed is
 * false. Always 403 - a subscription restriction is a permissions matter,
 * not a rate limit (429) or a missing resource (404) - with a stable
 * `code` (== EntitlementResult.reason) the extension can switch on directly
 * instead of parsing the human-readable `message`.
 */
export class SubscriptionDeniedException extends HttpException {
  constructor(result: EntitlementResult) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        code: result.reason,
        message: SubscriptionDeniedException.messageFor(result),
        featureKey: result.featureKey,
        limit: result.limit,
        used: result.used,
        remaining: result.remaining,
        period: result.period,
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private static messageFor(result: EntitlementResult): string {
    switch (result.reason) {
      case 'FEATURE_DISABLED':
        return `${result.featureKey} is not available on your current plan.`;
      case 'LIMIT_REACHED':
        return `You've reached your ${result.featureKey} limit (${result.limit}).`;
      case 'NO_ACTIVE_SUBSCRIPTION':
        return 'No active subscription found for this account.';
      case 'FEATURE_NOT_CONFIGURED':
        return `${result.featureKey} is not available on your current plan.`;
      default:
        return `${result.featureKey} is not permitted.`;
    }
  }
}
