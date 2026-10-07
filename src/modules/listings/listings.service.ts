import { Injectable } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionDeniedException } from '../subscriptions/exceptions/subscription-denied.exception';
import { EntitlementResult } from '../subscriptions/entitlement.types';
import { UsageService } from '../usage/usage.service';
import { UsagePeriodType } from '../usage/models/usage-counter.model';

/** Plan feature key for "listings filled with a template" (Free: 100 in total). */
export const LISTING_FEATURE = 'listing.create';

const LIFETIME_KEY = 'lifetime';

/**
 * Counts the listings a user has filled with a template. The plan decides the cap
 * (plan_features row `listing.create`); this only keeps the running total. With no
 * period on the plan row the total is lifetime, with a daily/monthly period the
 * regular period counter is used instead.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageService: UsageService,
  ) {}

  /** Where the user stands against their plan's listing cap, without counting anything. */
  async getStatus(userId: string): Promise<EntitlementResult> {
    const used = await this.usageService.getUsage(
      userId,
      LISTING_FEATURE,
      UsagePeriodType.LIFETIME,
      LIFETIME_KEY,
    );
    return this.subscriptionsService.checkLimit(userId, LISTING_FEATURE, {
      currentCount: used,
    });
  }

  /** Counts one listing. Refused (403 LIMIT_REACHED) once the cap is used up. */
  async record(userId: string): Promise<EntitlementResult> {
    const before = await this.getStatus(userId);
    if (!before.allowed) {
      throw new SubscriptionDeniedException(before);
    }

    // Period-based plan rows count in their own window; the lifetime total is always kept.
    await this.subscriptionsService.recordUsage(userId, LISTING_FEATURE);
    await this.usageService.incrementUsage(
      userId,
      LISTING_FEATURE,
      UsagePeriodType.LIFETIME,
      LIFETIME_KEY,
    );
    return this.getStatus(userId);
  }
}
