import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { User } from '../../users/models/user.model';
import { UsersService } from '../../users/users.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin/users')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminUsersController {
  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get()
  async findAll(@Query() query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.usersService.findAll({
      page,
      limit,
      search: query.search,
      isActive: query.isActive,
    });
    return { data, total, page, limit };
  }

  /** User detail plus their current subscription and full plan history - findOne() 404s if the id doesn't exist. */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    const [currentSubscription, subscriptionHistory] = await Promise.all([
      this.subscriptionsService.getCurrentSubscription(id),
      this.subscriptionsService.getHistory(id),
    ]);
    return { ...user.toJSON(), currentSubscription, subscriptionHistory };
  }

  private readonly logger = new Logger(AdminUsersController.name);

  /** A failing section (e.g. a table that isn't migrated yet) is logged and returns no rows instead of failing the whole page. */
  private async query<T extends object>(
    sql: string,
    userId: string,
  ): Promise<T[]> {
    try {
      return await this.userModel.sequelize!.query<T>(sql, {
        replacements: { userId },
        type: QueryTypes.SELECT,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `activity query failed (${sql.trim().slice(0, 80)}...): ${message}`,
      );
      return [];
    }
  }

  /**
   * Everything the user-detail page needs beyond the profile: account milestones, content counts, feature usage,
   * Meesho payment-sync activity, Razorpay purchases and a merged recent-activity timeline. Read-only; amounts in paise.
   */
  @Get(':id/activity')
  async activity(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);

    const [
      [counts],
      usage,
      [syncTotals],
      syncLogs,
      payments,
      [paymentTotals],
      templates,
      subscriptions,
    ] = await Promise.all([
      this.query<{
        templates: string;
        recordings: string;
        productCosts: string;
        meeshoPayouts: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM templates WHERE "userId" = :userId) AS templates,
           (SELECT COUNT(*) FROM recordings WHERE "userId" = :userId) AS recordings,
           (SELECT COUNT(*) FROM config.product_costs WHERE "userId" = :userId) AS "productCosts",
           (SELECT COUNT(*) FROM config.meesho_payments WHERE "userId" = :userId) AS "meeshoPayouts"`,
        id,
      ),
      this.query<{
        featureKey: string;
        periodType: string;
        periodKey: string;
        usageCount: number;
        updatedAt: Date;
      }>(
        `SELECT "featureKey", "periodType", "periodKey", "usageCount", "updatedAt"
           FROM usage_counters WHERE "userId" = :userId
          ORDER BY "updatedAt" DESC LIMIT 60`,
        id,
      ),
      this.query<{
        runs: string;
        successRuns: string;
        failedRuns: string;
        inserted: string;
        lastSyncedAt: Date | null;
        lastSuccessAt: Date | null;
      }>(
        `SELECT COUNT(*) AS runs,
                COUNT(*) FILTER (WHERE status = 'success') AS "successRuns",
                COUNT(*) FILTER (WHERE status = 'error') AS "failedRuns",
                COALESCE(SUM(inserted), 0) AS inserted,
                MAX("syncedAt") AS "lastSyncedAt",
                MAX("syncedAt") FILTER (WHERE status = 'success') AS "lastSuccessAt"
           FROM config.meesho_payment_sync_logs WHERE "userId" = :userId`,
        id,
      ),
      this.query<{
        syncLogId: string;
        kind: string;
        paymentDate: string | null;
        status: string;
        received: number;
        inserted: number;
        skipped: number;
        errorMessage: string | null;
        syncedAt: Date;
      }>(
        `SELECT "syncLogId", kind, "paymentDate", status, received, inserted, skipped, "errorMessage", "syncedAt"
           FROM config.meesho_payment_sync_logs WHERE "userId" = :userId
          ORDER BY "syncedAt" DESC LIMIT 10`,
        id,
      ),
      this.query<{
        paymentId: string;
        planCode: string;
        interval: string;
        amount: number;
        currency: string;
        razorpayPaymentId: string | null;
        status: string;
        paidAt: Date | null;
        refundedAt: Date | null;
        periodStart: Date | null;
        periodEnd: Date | null;
        createdAt: Date;
      }>(
        `SELECT "paymentId", "planCode", "interval", amount, currency, "razorpayPaymentId", status,
                "paidAt", "refundedAt", "periodStart", "periodEnd", "createdAt"
           FROM payments WHERE "userId" = :userId
          ORDER BY "createdAt" DESC LIMIT 20`,
        id,
      ),
      this.query<{ spent: string; paidCount: string; refunded: string }>(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE "paidAt" IS NOT NULL AND "refundedAt" IS NULL), 0) AS spent,
                COUNT(*) FILTER (WHERE "paidAt" IS NOT NULL) AS "paidCount",
                COALESCE(SUM(amount) FILTER (WHERE "refundedAt" IS NOT NULL), 0) AS refunded
           FROM payments WHERE "userId" = :userId`,
        id,
      ),
      this.query<{
        templateId: string;
        name: string;
        domain: string;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT "templateId", name, domain, "createdAt", "updatedAt"
           FROM templates WHERE "userId" = :userId
          ORDER BY "updatedAt" DESC LIMIT 5`,
        id,
      ),
      this.subscriptionsService.getHistory(id),
    ]);

    const lastTemplate = templates[0] ?? null;
    const lastSyncedAt = syncTotals?.lastSyncedAt ?? null;

    const timeline: {
      type: string;
      title: string;
      detail?: string;
      at: Date;
    }[] = [
      { type: 'joined', title: 'Joined Rocket Listing', at: user.createdAt },
    ];
    if (user.lastLoginAt) {
      timeline.push({
        type: 'login',
        title: 'Last signed in',
        at: user.lastLoginAt,
      });
    }
    for (const sub of subscriptions) {
      timeline.push({
        type: 'subscription',
        title: `${sub.plan.name} plan started`,
        detail: `${sub.source} · ${sub.status.toLowerCase()}`,
        at: sub.startedAt,
      });
    }
    for (const p of payments) {
      if (p.paidAt) {
        timeline.push({
          type: 'payment',
          title: `Paid ${p.currency} ${(p.amount / 100).toLocaleString('en-IN')}`,
          detail: `${p.planCode} · ${p.interval}`,
          at: p.paidAt,
        });
      }
      if (p.refundedAt) {
        timeline.push({
          type: 'refund',
          title: 'Payment refunded',
          detail: p.planCode,
          at: p.refundedAt,
        });
      }
    }
    for (const log of syncLogs) {
      timeline.push({
        type: log.status === 'success' ? 'sync' : 'sync-error',
        title:
          log.kind === 'details'
            ? 'Synced payout details'
            : 'Synced Meesho payments',
        detail:
          log.status === 'success'
            ? `${log.inserted} new · ${log.skipped} skipped`
            : (log.errorMessage ?? 'Sync failed'),
        at: log.syncedAt,
      });
    }
    for (const t of templates) {
      timeline.push({
        type: 'template',
        title: `Saved template "${t.name}"`,
        detail: t.domain,
        at: t.createdAt,
      });
    }
    const time = (d: Date) => new Date(d).getTime();
    timeline.sort((a, b) => time(b.at) - time(a.at));

    const lastActiveAt =
      [
        user.lastActiveAt,
        user.lastLoginAt,
        lastSyncedAt,
        lastTemplate?.updatedAt,
      ]
        .filter((d): d is Date => !!d)
        .sort((a, b) => time(b) - time(a))[0] ?? null;

    return {
      joinedAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastActiveAt,
      counts: {
        templates: Number(counts?.templates ?? 0),
        recordings: Number(counts?.recordings ?? 0),
        productCosts: Number(counts?.productCosts ?? 0),
        meeshoPayouts: Number(counts?.meeshoPayouts ?? 0),
      },
      usage,
      sync: {
        runs: Number(syncTotals?.runs ?? 0),
        successRuns: Number(syncTotals?.successRuns ?? 0),
        failedRuns: Number(syncTotals?.failedRuns ?? 0),
        recordsImported: Number(syncTotals?.inserted ?? 0),
        lastSyncedAt,
        lastSuccessAt: syncTotals?.lastSuccessAt ?? null,
        recent: syncLogs,
      },
      billing: {
        totalSpent: Number(paymentTotals?.spent ?? 0),
        paidCount: Number(paymentTotals?.paidCount ?? 0),
        refunded: Number(paymentTotals?.refunded ?? 0),
        payments,
      },
      lastTemplate,
      timeline: timeline.slice(0, 30),
    };
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.setActive(id, dto.isActive);
  }
}
