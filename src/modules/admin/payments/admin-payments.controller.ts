import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, WhereOptions } from 'sequelize';
import {
  Payment,
  PaymentStatus,
} from '../../payment-gateway/models/payment.model';
import {
  PaymentWebhookEvent,
  WebhookEventStatus,
} from '../../payment-gateway/models/payment-webhook-event.model';
import { User } from '../../users/models/user.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import {
  ListPaymentsQueryDto,
  PaymentsSummaryQueryDto,
} from './dto/list-payments-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SumRow {
  revenue: string | null;
  count: string;
}

/**
 * Razorpay back-office: revenue, order funnel, plan mix and webhook health, all
 * read from the purchase ledger (`payments`) and the webhook log. Amounts are
 * returned in paise, exactly as stored.
 *
 * "Revenue" means orders that were paid and not refunded.
 */
@Controller('admin/payments')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminPaymentsController {
  constructor(
    @InjectModel(Payment) private readonly paymentModel: typeof Payment,
    @InjectModel(PaymentWebhookEvent)
    private readonly eventModel: typeof PaymentWebhookEvent,
  ) {}

  private query<T extends object>(
    sql: string,
    replacements: Record<string, unknown>,
  ) {
    return this.paymentModel.sequelize!.query<T>(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });
  }

  @Get('summary')
  async summary(@Query() query: PaymentsSummaryQueryDto) {
    const days = query.days ?? 30;
    const now = new Date();
    const start = new Date(now.getTime() - days * DAY_MS);
    const previousStart = new Date(start.getTime() - days * DAY_MS);
    const paid = `"paidAt" IS NOT NULL`;

    const windowSum = async (from: Date, to: Date) => {
      const [row] = await this.query<SumRow>(
        `SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS count
           FROM payments WHERE ${paid} AND "refundedAt" IS NULL
            AND "paidAt" >= :from AND "paidAt" < :to`,
        { from, to },
      );
      return { revenue: Number(row.revenue ?? 0), count: Number(row.count) };
    };

    const [
      current,
      previous,
      lifetime,
      statusRows,
      daily,
      byPlan,
      byInterval,
      eventRows,
      lastEvent,
      failures,
      recent,
      topCustomers,
    ] = await Promise.all([
      windowSum(start, new Date(now.getTime() + 1)),
      windowSum(previousStart, start),
      this.query<{ gross: string | null; refunded: string | null }>(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE ${paid}), 0) AS gross,
                COALESCE(SUM(amount) FILTER (WHERE "refundedAt" IS NOT NULL), 0) AS refunded
           FROM payments`,
        {},
      ),
      this.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM payments GROUP BY status`,
        {},
      ),
      this.query<{ date: string; revenue: string; count: string }>(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(p.amount), 0) AS revenue, COUNT(p."paymentId") AS count
           FROM generate_series(CAST(:start AS date), CAST(:end AS date), interval '1 day') d
           LEFT JOIN payments p ON p."paidAt"::date = d::date AND p."refundedAt" IS NULL
          GROUP BY d ORDER BY d`,
        { start, end: now },
      ),
      this.query<{ planCode: string; revenue: string; count: string }>(
        `SELECT "planCode", SUM(amount) AS revenue, COUNT(*) AS count
           FROM payments WHERE ${paid} AND "refundedAt" IS NULL
          GROUP BY "planCode" ORDER BY revenue DESC`,
        {},
      ),
      this.query<{ interval: string; revenue: string; count: string }>(
        `SELECT "interval", SUM(amount) AS revenue, COUNT(*) AS count
           FROM payments WHERE ${paid} AND "refundedAt" IS NULL
          GROUP BY "interval" ORDER BY revenue DESC`,
        {},
      ),
      this.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM payment_webhook_events
          WHERE "createdAt" >= :since GROUP BY status`,
        { since: new Date(now.getTime() - 7 * DAY_MS) },
      ),
      this.eventModel.findOne({ order: [['createdAt', 'DESC']] }),
      this.eventModel.findAll({
        where: { status: WebhookEventStatus.FAILED },
        order: [['createdAt', 'DESC']],
        limit: 5,
        attributes: ['eventId', 'eventType', 'error', 'createdAt'],
      }),
      this.paymentModel.findAll({
        include: [
          { model: User, attributes: ['userId', 'email', 'displayName'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: 6,
      }),
      this.query<{
        userId: string;
        email: string;
        displayName: string | null;
        total: string;
        orders: string;
      }>(
        `SELECT u."userId", u.email, u."displayName", SUM(p.amount) AS total, COUNT(*) AS orders
           FROM payments p JOIN users u ON u."userId" = p."userId"
          WHERE p."paidAt" IS NOT NULL AND p."refundedAt" IS NULL
          GROUP BY u."userId" ORDER BY total DESC LIMIT 5`,
        {},
      ),
    ]);

    const statusCount = (s: string) =>
      Number(statusRows.find((r) => r.status === s)?.count ?? 0);
    const created = statusCount(PaymentStatus.CREATED);
    const paidCount = statusCount(PaymentStatus.PAID);
    const refundedCount = statusCount(PaymentStatus.REFUNDED);
    const orders = created + paidCount + refundedCount;
    const gross = Number(lifetime[0]?.gross ?? 0);
    const refunded = Number(lifetime[0]?.refunded ?? 0);
    const eventCount = (s: string) =>
      Number(eventRows.find((r) => r.status === s)?.count ?? 0);

    return {
      days,
      totals: {
        grossRevenue: gross,
        refunded,
        netRevenue: gross - refunded,
        orders,
        paidCount,
        refundedCount,
        abandonedCount: created,
        conversionRate: orders ? (paidCount + refundedCount) / orders : 0,
        averageOrderValue: paidCount
          ? Math.round((gross - refunded) / paidCount)
          : 0,
      },
      window: {
        revenue: current.revenue,
        previousRevenue: previous.revenue,
        paidCount: current.count,
        previousPaidCount: previous.count,
      },
      daily: daily.map((d) => ({
        date: d.date,
        revenue: Number(d.revenue),
        count: Number(d.count),
      })),
      byPlan: byPlan.map((r) => ({
        planCode: r.planCode,
        revenue: Number(r.revenue),
        count: Number(r.count),
      })),
      byInterval: byInterval.map((r) => ({
        interval: r.interval,
        revenue: Number(r.revenue),
        count: Number(r.count),
      })),
      webhooks: {
        last7Days: {
          processed: eventCount(WebhookEventStatus.PROCESSED),
          failed: eventCount(WebhookEventStatus.FAILED),
          received: eventCount(WebhookEventStatus.RECEIVED),
        },
        lastEvent: lastEvent
          ? {
              eventType: lastEvent.eventType,
              status: lastEvent.status,
              at: lastEvent.createdAt as Date,
            }
          : null,
        recentFailures: failures,
      },
      recent,
      topCustomers: topCustomers.map((c) => ({
        userId: c.userId,
        email: c.email,
        displayName: c.displayName,
        total: Number(c.total),
        orders: Number(c.orders),
      })),
    };
  }

  @Get()
  async list(@Query() query: ListPaymentsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: WhereOptions = {};
    if (query.status) Object.assign(where, { status: query.status });
    if (query.interval) Object.assign(where, { interval: query.interval });
    if (query.planCode) Object.assign(where, { planCode: query.planCode });

    const search = query.search?.trim();
    if (search) {
      const like = { [Op.iLike]: `%${search}%` };
      Object.assign(where, {
        [Op.or]: [
          { razorpayOrderId: like },
          { razorpayPaymentId: like },
          { '$user.email$': like },
          { '$user.displayName$': like },
        ],
      });
    }

    const { rows, count } = await this.paymentModel.findAndCountAll({
      where,
      include: [
        { model: User, attributes: ['userId', 'email', 'displayName'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      subQuery: false,
    });

    return { data: rows, total: count, page, limit };
  }

  @Get(':paymentId')
  async findOne(@Param('paymentId') paymentId: string) {
    const payment = await this.paymentModel.findByPk(paymentId, {
      include: [
        { model: User, attributes: ['userId', 'email', 'displayName'] },
      ],
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}
