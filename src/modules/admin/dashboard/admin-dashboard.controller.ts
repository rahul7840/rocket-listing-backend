import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { User } from '../../users/models/user.model';
import { Template } from '../../templates/models/template.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * DAY_MS;

/** A user has "used the product" once they own any template, usage counter, synced Meesho payment or product cost. */
const USED_FEATURE = `(
  EXISTS (SELECT 1 FROM templates t WHERE t."userId" = u."userId")
  OR EXISTS (SELECT 1 FROM usage_counters c WHERE c."userId" = u."userId")
  OR EXISTS (SELECT 1 FROM config.meesho_payments m WHERE m."userId" = u."userId")
  OR EXISTS (SELECT 1 FROM config.product_costs pc WHERE pc."userId" = u."userId")
)`;

const PAID_EVER = `EXISTS (
  SELECT 1 FROM payments p WHERE p."userId" = u."userId" AND p."paidAt" IS NOT NULL
)`;

/**
 * Per user, their most recent paid (and not refunded) Razorpay period. A user
 * who renewed shows only their newest period, so "ends soon" never lists
 * someone who already paid again.
 */
const LATEST_PAID_PERIOD = `latest AS (
  SELECT DISTINCT ON ("userId") "userId", "planCode", "periodEnd"
    FROM payments
   WHERE "paidAt" IS NOT NULL AND "refundedAt" IS NULL AND "periodEnd" IS NOT NULL
   ORDER BY "userId", "periodEnd" DESC
)`;

interface PayerRow {
  userId: string;
  email: string;
  displayName: string | null;
  mobileNumber: string | null;
  planCode: string;
  periodEnd: Date;
  lastActiveAt: Date | null;
}

/**
 * Overview numbers for the admin home page.
 *
 * Definitions (so the numbers are not misread):
 * - active users: `lastActiveAt` inside the window. NOT the `isActive` flag,
 *   which only means "account enabled" and is true for everyone.
 * - paying customers: users whose latest paid, non-refunded Razorpay period has
 *   not ended. Plans granted by hand in the admin panel are counted apart.
 * - subscriptions by plan: active rows whose period has not ended. A paid plan
 *   is only marked expired lazily, the next time that user calls the API, so
 *   counting `status = active` alone over-counts.
 * - "came back": last seen at least an hour after signing up.
 *
 * Read-only: every query here is a SELECT.
 */
@Controller('admin/dashboard')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminDashboardController {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Template)
    private readonly templateModel: typeof Template,
  ) {}

  private query<T extends object>(sql: string): Promise<T[]> {
    return this.userModel.sequelize!.query<T>(sql, {
      type: QueryTypes.SELECT,
    });
  }

  @Get('summary')
  async summary() {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

    const [
      activityRows,
      funnelRows,
      checkoutRows,
      payingRows,
      plans,
      renewals,
      paidInactive,
      cohorts,
      featureUsage,
      templateRows,
      totalTemplates,
      templatesLast7Days,
    ] = await Promise.all([
      this.query<Record<string, string>>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE "isActive") AS enabled,
                count(*) FILTER (WHERE "lastActiveAt" >= now() - interval '24 hours') AS active_24h,
                count(*) FILTER (WHERE "lastActiveAt" >= now() - interval '7 days') AS active_7d,
                count(*) FILTER (WHERE "lastActiveAt" >= now() - interval '30 days') AS active_30d,
                count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS new_7d,
                count(*) FILTER (WHERE "createdAt" >= now() - interval '14 days'
                                   AND "createdAt" < now() - interval '7 days') AS new_prev_7d
           FROM users`,
      ),
      this.query<Record<string, string>>(
        `SELECT count(*) AS signups,
                count(*) FILTER (WHERE u."lastActiveAt" IS NOT NULL
                                   AND u."lastActiveAt" - u."createdAt" >= interval '1 hour') AS returned,
                count(*) FILTER (WHERE ${USED_FEATURE}) AS used_feature,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM payments p WHERE p."userId" = u."userId")) AS started_checkout,
                count(*) FILTER (WHERE ${PAID_EVER}) AS paid
           FROM users u`,
      ),
      this.query<{
        last_order_at: Date | null;
        last_paid_at: Date | null;
        users_started_7d: string;
        users_started_prev_7d: string;
        abandoned_users: string;
        signups_since_last_order: string;
        failed_30d: string;
      }>(
        `SELECT max("createdAt") AS last_order_at,
                max("paidAt") AS last_paid_at,
                count(DISTINCT "userId") FILTER (WHERE "createdAt" >= now() - interval '7 days') AS users_started_7d,
                count(DISTINCT "userId") FILTER (WHERE "createdAt" >= now() - interval '14 days'
                                                   AND "createdAt" < now() - interval '7 days') AS users_started_prev_7d,
                (SELECT count(DISTINCT p."userId") FROM payments p
                  WHERE NOT EXISTS (SELECT 1 FROM payments q
                                     WHERE q."userId" = p."userId" AND q."paidAt" IS NOT NULL)) AS abandoned_users,
                (SELECT count(*) FROM users
                  WHERE "createdAt" > COALESCE((SELECT max("createdAt") FROM payments), '-infinity'::timestamptz)) AS signups_since_last_order,
                (SELECT count(*) FROM payment_webhook_events
                  WHERE "eventType" = 'payment.failed' AND "createdAt" >= now() - interval '30 days') AS failed_30d
           FROM payments`,
      ),
      this.query<Record<string, string>>(
        `WITH ${LATEST_PAID_PERIOD}
         SELECT (SELECT count(*) FROM latest WHERE "periodEnd" > now()) AS paying_customers,
                (SELECT count(*)
                   FROM user_subscriptions s JOIN plans p ON p."planId" = s."planId"
                  WHERE s.status = 'active' AND p.code <> 'FREE'
                    AND (s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > now())
                    AND s."userId" NOT IN (SELECT "userId" FROM latest WHERE "periodEnd" > now())) AS admin_granted,
                (SELECT count(*)
                   FROM user_subscriptions s JOIN plans p ON p."planId" = s."planId"
                  WHERE s.status = 'active' AND p.code <> 'FREE'
                    AND s."currentPeriodEnd" IS NOT NULL AND s."currentPeriodEnd" <= now()) AS lapsed`,
      ),
      this.query<{ plan_code: string; count: string }>(
        `SELECT p.code AS plan_code, count(*) AS count
           FROM user_subscriptions s JOIN plans p ON p."planId" = s."planId"
          WHERE s.status = 'active'
            AND (s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > now())
          GROUP BY p.code ORDER BY count DESC`,
      ),
      // Paid plans that end within 14 days, or ended in the last 14 and were not renewed.
      this.query<PayerRow>(
        `WITH ${LATEST_PAID_PERIOD}
         SELECT u."userId", u.email, u."displayName", u."mobileNumber",
                l."planCode", l."periodEnd", u."lastActiveAt"
           FROM latest l JOIN users u ON u."userId" = l."userId"
          WHERE l."periodEnd" BETWEEN now() - interval '14 days' AND now() + interval '14 days'
          ORDER BY l."periodEnd" ASC LIMIT 25`,
      ),
      // Paying right now but not seen for 7 days (or ever after paying).
      this.query<PayerRow>(
        `WITH ${LATEST_PAID_PERIOD}
         SELECT u."userId", u.email, u."displayName", u."mobileNumber",
                l."planCode", l."periodEnd", u."lastActiveAt"
           FROM latest l JOIN users u ON u."userId" = l."userId"
          WHERE l."periodEnd" > now()
            AND (u."lastActiveAt" IS NULL OR u."lastActiveAt" < now() - interval '7 days')
          ORDER BY u."lastActiveAt" ASC NULLS FIRST LIMIT 25`,
      ),
      this.query<{
        week_start: string;
        signups: string;
        used_feature: string;
        left_early: string;
        paid: string;
      }>(
        `SELECT to_char(date_trunc('week', u."createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS week_start,
                count(*) AS signups,
                count(*) FILTER (WHERE ${USED_FEATURE}) AS used_feature,
                count(*) FILTER (WHERE u."lastActiveAt" IS NULL
                                    OR u."lastActiveAt" - u."createdAt" < interval '1 hour') AS left_early,
                count(*) FILTER (WHERE ${PAID_EVER}) AS paid
           FROM users u
          WHERE (u."createdAt" AT TIME ZONE 'Asia/Kolkata')
                >= date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') - interval '7 weeks'
          GROUP BY 1 ORDER BY 1`,
      ),
      this.query<{ feature_key: string; users: string; uses: string }>(
        `SELECT "featureKey" AS feature_key,
                count(DISTINCT "userId") AS users,
                COALESCE(sum("usageCount"), 0) AS uses
           FROM usage_counters GROUP BY "featureKey"
          ORDER BY users DESC, uses DESC`,
      ),
      // Only templates that reached the server. The extension saves a template in the
      // browser first and syncs best-effort, and `playCount` only moves on a fully
      // successful replay of a synced template, so neither is a usage measure.
      this.query<{ total: string; creators: string }>(
        `SELECT count(*) AS total, count(DISTINCT "userId") AS creators
           FROM templates`,
      ),
      this.templateModel.count(),
      this.templateModel.count({
        where: { createdAt: { [Op.gte]: sevenDaysAgo } },
      }),
    ]);

    const activity = activityRows[0];
    const funnel = funnelRows[0];
    const checkout = checkoutRows[0];
    const paying = payingRows[0];
    const templateStats = templateRows[0];
    const num = (v: string | undefined) => Number(v ?? 0);

    const lastOrderAt = checkout.last_order_at;
    const payer = (r: PayerRow) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName,
      mobileNumber: r.mobileNumber,
      planCode: r.planCode,
      periodEnd: r.periodEnd,
      lastActiveAt: r.lastActiveAt,
    });

    return {
      // Existing fields (the old admin UI still reads these). `activeUsers` now
      // means "seen in the last 7 days" instead of the always-true enabled flag.
      totalUsers: num(activity.total),
      activeUsers: num(activity.active_7d),
      newUsersLast7Days: num(activity.new_7d),
      subscriptionsByPlan: plans.map((r) => ({
        planCode: r.plan_code,
        count: Number(r.count),
      })),
      totalTemplates,
      templatesLast7Days,

      newUsersPrevious7Days: num(activity.new_prev_7d),
      activity: {
        enabledUsers: num(activity.enabled),
        disabledUsers: num(activity.total) - num(activity.enabled),
        active24h: num(activity.active_24h),
        active7d: num(activity.active_7d),
        active30d: num(activity.active_30d),
      },
      funnel: {
        signups: num(funnel.signups),
        returned: num(funnel.returned),
        usedFeature: num(funnel.used_feature),
        startedCheckout: num(funnel.started_checkout),
        paid: num(funnel.paid),
      },
      paying: {
        customers: num(paying.paying_customers),
        adminGranted: num(paying.admin_granted),
        lapsed: num(paying.lapsed),
      },
      checkout: {
        lastOrderAt,
        lastPaidAt: checkout.last_paid_at,
        daysSinceLastOrder: lastOrderAt
          ? Math.floor((Date.now() - lastOrderAt.getTime()) / DAY_MS)
          : null,
        signupsSinceLastOrder: num(checkout.signups_since_last_order),
        usersStartedLast7Days: num(checkout.users_started_7d),
        usersStartedPrevious7Days: num(checkout.users_started_prev_7d),
        abandonedUsers: num(checkout.abandoned_users),
        failedPaymentsLast30Days: num(checkout.failed_30d),
      },
      renewals: renewals.map(payer),
      paidInactive: paidInactive.map(payer),
      cohorts: cohorts.map((c) => ({
        weekStart: c.week_start,
        signups: Number(c.signups),
        usedFeature: Number(c.used_feature),
        leftEarly: Number(c.left_early),
        paid: Number(c.paid),
      })),
      features: {
        usage: featureUsage.map((f) => ({
          featureKey: f.feature_key,
          users: Number(f.users),
          uses: Number(f.uses),
        })),
        templates: {
          total: num(templateStats.total),
          creators: num(templateStats.creators),
        },
      },
    };
  }
}
