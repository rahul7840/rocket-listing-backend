import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { UsageCounter, UsagePeriodType } from './models/usage-counter.model';

/**
 * Generic feature-usage tracking: one counter per (user, feature, period),
 * reusable for any feature key without a dedicated table or model. Pure
 * bookkeeping only - it knows nothing about plans or limits. Whether a given
 * count is "allowed" is a later phase's concern (SubscriptionService +
 * guards); this service just tracks and reports counts.
 */
@Injectable()
export class UsageService {
  constructor(
    @InjectModel(UsageCounter)
    private readonly usageCounterModel: typeof UsageCounter,
  ) {}

  /** Derives the period key a count should land in right now, given a period type. */
  currentPeriodKey(
    periodType: UsagePeriodType,
    now: Date = new Date(),
  ): string {
    const iso = now.toISOString();
    switch (periodType) {
      case UsagePeriodType.DAILY:
        return iso.slice(0, 10); // "2026-09-18"
      case UsagePeriodType.MONTHLY:
        return iso.slice(0, 7); // "2026-09"
      case UsagePeriodType.LIFETIME:
        return 'lifetime';
    }
  }

  /** Current count for a (user, feature, period). 0 if no counter row exists yet. */
  async getUsage(
    userId: string,
    featureKey: string,
    periodType: UsagePeriodType,
    periodKey: string,
  ): Promise<number> {
    const counter = await this.usageCounterModel.findOne({
      where: { userId, featureKey, periodType, periodKey },
    });
    return counter?.usageCount ?? 0;
  }

  /**
   * Atomically creates or increments the counter for a (user, feature,
   * period) and returns the resulting count. Implemented as a single
   * INSERT ... ON CONFLICT DO UPDATE statement (Postgres upsert) so
   * concurrent requests can never read-modify-write over each other -
   * the increment happens inside the database, not in application code.
   */
  async incrementUsage(
    userId: string,
    featureKey: string,
    periodType: UsagePeriodType,
    periodKey: string,
    incrementBy = 1,
  ): Promise<number> {
    const sequelize = this.usageCounterModel.sequelize!;
    const rows = await sequelize.query<{ usageCount: number }>(
      `INSERT INTO usage_counters
         ("usageCounterId", "userId", "featureKey", "periodType", "periodKey", "usageCount", "createdAt", "updatedAt")
       VALUES
         (gen_random_uuid(), :userId, :featureKey, :periodType, :periodKey, :incrementBy, now(), now())
       ON CONFLICT ("userId", "featureKey", "periodType", "periodKey")
       DO UPDATE SET
         "usageCount" = usage_counters."usageCount" + :incrementBy,
         "updatedAt" = now()
       RETURNING "usageCount";`,
      {
        replacements: {
          userId,
          featureKey,
          periodType,
          periodKey,
          incrementBy,
        },
        type: QueryTypes.SELECT,
      },
    );
    return rows[0].usageCount;
  }

  /** Whether the user is still under `limit` for a (user, feature, period). `null` limit means unlimited. */
  async checkUsage(
    userId: string,
    featureKey: string,
    periodType: UsagePeriodType,
    periodKey: string,
    limit: number | null,
  ): Promise<boolean> {
    if (limit === null) {
      return true;
    }
    const usage = await this.getUsage(
      userId,
      featureKey,
      periodType,
      periodKey,
    );
    return usage < limit;
  }

  /** How much of `limit` is left for a (user, feature, period). `null` if unlimited. */
  async getRemainingUsage(
    userId: string,
    featureKey: string,
    periodType: UsagePeriodType,
    periodKey: string,
    limit: number | null,
  ): Promise<number | null> {
    if (limit === null) {
      return null;
    }
    const usage = await this.getUsage(
      userId,
      featureKey,
      periodType,
      periodKey,
    );
    return Math.max(limit - usage, 0);
  }
}
