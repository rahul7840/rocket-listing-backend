import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn } from 'sequelize';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ProductCostsService } from '../product-costs/product-costs.service';
import { MeeshoPayment } from './models/meesho-payment.model';
import { MeeshoPaymentDetail } from './models/meesho-payment-detail.model';
import { MeeshoPaymentSyncLog } from './models/meesho-payment-sync-log.model';
import {
  MeeshoPaymentItemDto,
  SyncMeeshoPaymentsDto,
} from './dto/sync-meesho-payments.dto';
import { SyncMeeshoPaymentDetailsDto } from './dto/sync-meesho-payment-details.dto';

/** plan_features keys - which plans get them, and the limits, live in that table (migration 20260919120000). */
export const PAYMENTS_SYNC_FEATURE = 'meesho.payments.sync';
export const PAYMENT_DETAILS_FEATURE = 'meesho.payments.details';

export interface SyncMeeshoPaymentsResult {
  received: number;
  inserted: number;
  skipped: number;
}

export interface SyncMeeshoPaymentDetailsResult {
  received: number;
  inserted: number;
  skipped: number;
}

interface FeatureAccess {
  allowed: boolean;
  /** EntitlementReason - lets the extension tell "upgrade your plan" from "already synced today". */
  reason: string;
}

export interface MeeshoSyncState {
  /** Newest payment date already stored, or null on a first sync. */
  lastPaymentDate: string | null;
  paymentsSync: FeatureAccess;
  paymentDetailsSync: FeatureAccess;
  /** Payment dates (newest first) still missing their order details; empty unless the plan allows details. */
  pendingDetailDates: string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const formatRupees = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export type FinanceRangeDays = 7 | 30 | 90;
const RANGE_CANDIDATES: FinanceRangeDays[] = [7, 30, 90];

export interface MoneyBreakdownRow {
  key: string;
  label: string;
  amount: number;
  /** Percent of the range's total order amount - the fixed baseline every row is measured against. */
  percentOfOrderAmount: number;
  children?: MoneyBreakdownRow[];
}

export interface PaymentListItem {
  meeshoPaymentId: string;
  paymentDate: string;
  neftId: string | null;
  orderAmount: number;
  platformRecovery: number;
  adsCost: number;
  programCost: number;
  platformCompensation: number;
  netAmount: number;
  orderDetailsCount: number;
}

export interface PaymentDetailOrderRow {
  orderNo: string;
  subOrderNo: string;
  sku: string | null;
  orderStatus: string | null;
  orderAmount: number;
  claimsCompensations: number;
  recoveriesCharges: number;
  netOrderAmount: number;
}

export interface PaymentDetailResponse {
  payment: PaymentListItem;
  hasDetails: boolean;
  orderDetails: PaymentDetailOrderRow[];
}

export interface FinanceAnalytics {
  range: { days: FinanceRangeDays; from: string; to: string };
  /** Which of 7/30/90 actually have at least one synced payment - the frontend should only offer these. */
  availableRanges: FinanceRangeDays[];
  hasPayments: boolean;
  earnings: {
    totalOrderAmount: number;
    platformRecovery: number;
    platformCompensation: number;
    netAmount: number;
  };
  moneyBreakdown: MoneyBreakdownRow[];
  trend: {
    days: Array<{ date: string; netAmount: number }>;
    averageDaily: number;
    highest: { date: string; amount: number } | null;
    lowest: { date: string; amount: number } | null;
  };
  orderOutcome: {
    /** False when no order-level details have been synced for any payout in this range (Max/Rocket-only feature). */
    hasDetails: boolean;
    totalOrders: number;
    delivered: number;
    returned: number;
    rto: number;
    other: number;
    deliveredRate: number;
    returnRate: number;
    rtoRate: number;
  };
  skuPerformance: {
    hasDetails: boolean;
    top: Array<{
      sku: string;
      orders: number;
      delivered: number;
      netOrderAmount: number;
      deliveredRate: number;
    }>;
    needsAttention: Array<{
      sku: string;
      orders: number;
      returned: number;
      rto: number;
      returnRate: number;
      rtoRate: number;
    }>;
  };
}

export interface ProfitabilityOverview {
  grossRevenue: number;
  meeshoDeductions: number;
  netRevenue: number;
  productCost: number;
  packagingCost: number;
  otherCost: number;
  estimatedProfit: number;
  /** Estimated profit / net revenue * 100. */
  profitMargin: number;
  /** Meesho deductions / gross revenue * 100. */
  meeshoCostPercent: number;
  /** Estimated cost exposure (product + packaging + other) tied to RTO/Return order lines. */
  returnLoss: number;
}

export interface ProductProfitabilityRow {
  sku: string;
  orders: number;
  revenue: number;
  netRevenue: number;
  meeshoCost: number;
  hasCost: boolean;
  productCost: number;
  packagingCost: number;
  otherCost: number;
  estimatedProfit: number;
  margin: number;
  delivered: number;
  returned: number;
  rto: number;
  returnRate: number;
  estimatedLoss: number;
}

export interface ProfitabilityInsight {
  type:
    'low_margin' | 'high_returns' | 'rising_deductions' | 'strong_performer';
  title: string;
  message: string;
  sku: string | null;
}

export interface ProfitabilityAnalytics {
  range: { days: FinanceRangeDays; from: string; to: string };
  hasPayments: boolean;
  hasDetails: boolean;
  hasProductCosts: boolean;
  overview: ProfitabilityOverview;
  products: ProductProfitabilityRow[];
  returns: {
    returnRate: number;
    returnedOrders: number;
    rtoOrders: number;
    returnLoss: number;
    recoveryCharges: number;
    byProduct: Array<{
      sku: string;
      orders: number;
      returns: number;
      returnRate: number;
      estimatedLoss: number;
    }>;
  };
  insights: ProfitabilityInsight[];
}

/** Order status is free-text scraped from Meesho's panel - no canonical enum exists, so this is a best-effort bucket. */
type OrderBucket = 'delivered' | 'return' | 'rto' | 'other';
function bucketOrderStatus(status: string | null): OrderBucket {
  const s = (status ?? '').toLowerCase();
  if (s.includes('rto')) return 'rto';
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('return')) return 'return';
  return 'other';
}

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);
const rangeStart = (today: Date, days: number): string => {
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return toDateOnly(start);
};

@Injectable()
export class MeeshoPaymentsService {
  constructor(
    @InjectModel(MeeshoPayment)
    private readonly paymentModel: typeof MeeshoPayment,
    @InjectModel(MeeshoPaymentDetail)
    private readonly detailModel: typeof MeeshoPaymentDetail,
    @InjectModel(MeeshoPaymentSyncLog)
    private readonly syncLogModel: typeof MeeshoPaymentSyncLog,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly productCostsService: ProductCostsService,
  ) {}

  /**
   * What the extension needs before it scrapes anything: how far the user's
   * data already goes (so it only fetches newer payouts), what their plan
   * allows, and which stored payouts still lack order details.
   */
  async getSyncState(userId: string): Promise<MeeshoSyncState> {
    const [latest, payments, details] = await Promise.all([
      this.paymentModel.findOne({
        where: { userId },
        attributes: ['paymentDate'],
        order: [['paymentDate', 'DESC']],
        raw: true,
      }),
      this.subscriptionsService.checkLimit(userId, PAYMENTS_SYNC_FEATURE),
      this.subscriptionsService.canUse(userId, PAYMENT_DETAILS_FEATURE),
    ]);

    const pending = details.allowed
      ? await this.paymentModel.findAll({
          where: { userId, detailsSyncedAt: null },
          attributes: ['paymentDate'],
          order: [['paymentDate', 'DESC']],
          raw: true,
        })
      : [];

    return {
      lastPaymentDate: latest?.paymentDate ?? null,
      paymentsSync: { allowed: payments.allowed, reason: payments.reason },
      paymentDetailsSync: { allowed: details.allowed, reason: details.reason },
      pendingDetailDates: pending.map((row) => row.paymentDate),
    };
  }

  /**
   * Stores every payout the extension scraped for this user, skipping any
   * payment date already on file (so re-syncing the same 30-day window is a
   * no-op). platformRecovery / platformCompensation are the panel's group
   * headers, derived here from their two sub-columns.
   */
  async sync(
    userId: string,
    dto: SyncMeeshoPaymentsDto,
  ): Promise<SyncMeeshoPaymentsResult> {
    // Same date twice in one payload: keep the first, like the DB would.
    const byDate = new Map<string, MeeshoPaymentItemDto>();
    for (const item of dto.payments) {
      if (!byDate.has(item.paymentDate)) byDate.set(item.paymentDate, item);
    }

    const dates = [...byDate.keys()];
    const existing = dates.length
      ? await this.paymentModel.findAll({
          where: { userId, paymentDate: dates },
          attributes: ['paymentDate'],
          raw: true,
        })
      : [];
    const known = new Set(existing.map((row) => row.paymentDate));

    const syncedAt = new Date();
    const fresh = [...byDate.values()]
      .filter((item) => !known.has(item.paymentDate))
      .map((item) => ({
        userId,
        paymentDate: item.paymentDate,
        neftId: item.neftId ?? null,
        orderAmount: item.orderAmount,
        platformRecovery: round2(item.adsCost + item.programCost),
        adsCost: item.adsCost,
        programCost: item.programCost,
        platformCompensation: round2(item.referral + item.programBenefits),
        referral: item.referral,
        programBenefits: item.programBenefits,
        netAmount: item.netAmount,
        syncedAt,
      }));

    // ignoreDuplicates (ON CONFLICT DO NOTHING) covers a concurrent sync
    // slipping in between the lookup above and this insert - the unique index
    // on (userId, paymentDate) is what actually makes a duplicate row
    // impossible, this call is just the fast path that skips a wasted attempt.
    if (fresh.length) {
      await this.paymentModel.bulkCreate(fresh, { ignoreDuplicates: true });
    }

    const result = {
      received: dto.payments.length,
      inserted: fresh.length,
      skipped: dto.payments.length - fresh.length,
    };

    await this.syncLogModel.create({
      userId,
      kind: 'payments',
      status: 'success',
      ...result,
    });

    return result;
  }

  /**
   * Stores the order lines of one payout and marks it as details-synced.
   * Re-sending a payout is harmless: lines already stored (same order + sub
   * order) are skipped.
   */
  async syncDetails(
    userId: string,
    dto: SyncMeeshoPaymentDetailsDto,
  ): Promise<SyncMeeshoPaymentDetailsResult> {
    const payment = await this.paymentModel.findOne({
      where: { userId, paymentDate: dto.paymentDate },
    });
    if (!payment) {
      throw new NotFoundException(
        `No synced payment for ${dto.paymentDate} - sync payments first.`,
      );
    }

    const syncedAt = new Date();
    const byKey = new Map<string, Record<string, unknown>>();
    for (const item of dto.details) {
      const subOrderNo = item.subOrderNo ?? '';
      const key = `${item.orderNo}|${subOrderNo}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        userId,
        meeshoPaymentId: payment.meeshoPaymentId,
        orderNo: item.orderNo,
        subOrderNo,
        sku: item.sku ?? null,
        orderStatus: item.orderStatus ?? null,
        subOrderContribution: item.subOrderContribution,
        orderAmount: item.orderAmount,
        claimsCompensations: item.claimsCompensations,
        recoveriesCharges: item.recoveriesCharges,
        netOrderAmount: item.netOrderAmount,
        syncedAt,
      });
    }

    const existing = await this.detailModel.findAll({
      where: { meeshoPaymentId: payment.meeshoPaymentId },
      attributes: ['orderNo', 'subOrderNo'],
      raw: true,
    });
    const known = new Set(
      existing.map((row) => `${row.orderNo}|${row.subOrderNo}`),
    );
    const fresh = [...byKey.entries()]
      .filter(([key]) => !known.has(key))
      .map(([, row]) => row);

    await this.detailModel.sequelize!.transaction(async (transaction) => {
      if (fresh.length) {
        await this.detailModel.bulkCreate(fresh, {
          ignoreDuplicates: true,
          transaction,
        });
      }
      await payment.update({ detailsSyncedAt: syncedAt }, { transaction });
    });

    const result = {
      received: dto.details.length,
      inserted: fresh.length,
      skipped: dto.details.length - fresh.length,
    };

    await this.syncLogModel.create({
      userId,
      kind: 'details',
      paymentDate: dto.paymentDate,
      status: 'success',
      ...result,
    });

    return result;
  }

  private toListItem(payment: any, orderDetailsCount: number): PaymentListItem {
    return {
      meeshoPaymentId: payment.meeshoPaymentId,
      paymentDate: payment.paymentDate,
      neftId: payment.neftId ?? null,
      orderAmount: Number(payment.orderAmount ?? 0),
      platformRecovery: Number(payment.platformRecovery ?? 0),
      adsCost: Number(payment.adsCost ?? 0),
      programCost: Number(payment.programCost ?? 0),
      platformCompensation: Number(payment.platformCompensation ?? 0),
      netAmount: Number(payment.netAmount ?? 0),
      orderDetailsCount,
    };
  }

  /** Payout rows for the Finance page's Payments table - one row per synced payment date. */
  async listPayments(
    userId: string,
    rangeDays: FinanceRangeDays,
  ): Promise<PaymentListItem[]> {
    const today = new Date();
    const toDate = toDateOnly(today);
    const fromDate = rangeStart(today, rangeDays);

    const payments = await this.paymentModel.findAll({
      where: { userId, paymentDate: { [Op.gte]: fromDate, [Op.lte]: toDate } },
      order: [['paymentDate', 'DESC']],
      raw: true,
    });
    if (payments.length === 0) return [];

    const paymentIds = payments.map((p: any) => p.meeshoPaymentId as string);
    const counts = (await this.detailModel.findAll({
      where: { meeshoPaymentId: paymentIds },
      attributes: [
        'meeshoPaymentId',
        [fn('COUNT', col('meeshoPaymentDetailId')), 'count'],
      ],
      group: ['meeshoPaymentId'],
      raw: true,
    })) as unknown as Array<{ meeshoPaymentId: string; count: string }>;
    const countByPaymentId = new Map(
      counts.map((c) => [c.meeshoPaymentId, Number(c.count)]),
    );

    return payments.map((p: any) =>
      this.toListItem(p, countByPaymentId.get(p.meeshoPaymentId) ?? 0),
    );
  }

  /** One payout plus its synced order lines, for the Payments table's "View details" drawer. */
  async getPaymentDetail(
    userId: string,
    meeshoPaymentId: string,
  ): Promise<PaymentDetailResponse> {
    const payment = await this.paymentModel.findOne({
      where: { userId, meeshoPaymentId },
      raw: true,
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const details = (await this.detailModel.findAll({
      where: { userId, meeshoPaymentId },
      order: [['orderNo', 'ASC']],
      raw: true,
    })) as any[];

    return {
      payment: this.toListItem(payment, details.length),
      hasDetails: !!(payment as any).detailsSyncedAt,
      orderDetails: details.map((d) => ({
        orderNo: d.orderNo,
        subOrderNo: d.subOrderNo,
        sku: d.sku ?? null,
        orderStatus: d.orderStatus ?? null,
        orderAmount: Number(d.orderAmount ?? 0),
        claimsCompensations: Number(d.claimsCompensations ?? 0),
        recoveriesCharges: Number(d.recoveriesCharges ?? 0),
        netOrderAmount: Number(d.netOrderAmount ?? 0),
      })),
    };
  }

  /**
   * Seller payment/profit analytics for the website Finance dashboard.
   * Built entirely from columns that exist on MeeshoPayment /
   * MeeshoPaymentDetail - no product cost, GST, or ad-spend-beyond-what's-
   * synced is invented here. See docs on those models for exactly what's
   * available.
   */
  async getAnalytics(
    userId: string,
    rangeDays: FinanceRangeDays,
  ): Promise<FinanceAnalytics> {
    const today = new Date();
    const toDate = toDateOnly(today);

    const rangeCounts = await Promise.all(
      RANGE_CANDIDATES.map((days) =>
        this.paymentModel.count({
          where: {
            userId,
            paymentDate: {
              [Op.gte]: rangeStart(today, days),
              [Op.lte]: toDate,
            },
          },
        }),
      ),
    );
    const availableRanges = RANGE_CANDIDATES.filter(
      (_, i) => rangeCounts[i] > 0,
    );

    const fromDate = rangeStart(today, rangeDays);
    const payments = await this.paymentModel.findAll({
      where: { userId, paymentDate: { [Op.gte]: fromDate, [Op.lte]: toDate } },
      order: [['paymentDate', 'ASC']],
      raw: true,
    });

    if (payments.length === 0) {
      return {
        range: { days: rangeDays, from: fromDate, to: toDate },
        availableRanges,
        hasPayments: false,
        earnings: {
          totalOrderAmount: 0,
          platformRecovery: 0,
          platformCompensation: 0,
          netAmount: 0,
        },
        moneyBreakdown: [],
        trend: { days: [], averageDaily: 0, highest: null, lowest: null },
        orderOutcome: {
          hasDetails: false,
          totalOrders: 0,
          delivered: 0,
          returned: 0,
          rto: 0,
          other: 0,
          deliveredRate: 0,
          returnRate: 0,
          rtoRate: 0,
        },
        skuPerformance: { hasDetails: false, top: [], needsAttention: [] },
      };
    }

    const sumField = (key: keyof MeeshoPayment): number =>
      round2(
        payments.reduce((acc, p) => acc + Number((p as any)[key] ?? 0), 0),
      );

    const totalOrderAmount = sumField('orderAmount');
    const platformRecovery = sumField('platformRecovery');
    const adsCost = sumField('adsCost');
    const programCost = sumField('programCost');
    const platformCompensation = sumField('platformCompensation');
    const referral = sumField('referral');
    const programBenefits = sumField('programBenefits');
    const netAmount = sumField('netAmount');

    const pctOfOrder = (amount: number): number =>
      totalOrderAmount > 0 ? round2((amount / totalOrderAmount) * 100) : 0;

    const moneyBreakdown: MoneyBreakdownRow[] = [
      {
        key: 'platformRecovery',
        label: 'Platform recovery',
        amount: platformRecovery,
        percentOfOrderAmount: pctOfOrder(platformRecovery),
        children: [
          {
            key: 'adsCost',
            label: 'Ads cost',
            amount: adsCost,
            percentOfOrderAmount: pctOfOrder(adsCost),
          },
          {
            key: 'programCost',
            label: 'Program cost',
            amount: programCost,
            percentOfOrderAmount: pctOfOrder(programCost),
          },
        ],
      },
      {
        key: 'platformCompensation',
        label: 'Platform compensation',
        amount: platformCompensation,
        percentOfOrderAmount: pctOfOrder(platformCompensation),
        children: [
          {
            key: 'referral',
            label: 'Referral',
            amount: referral,
            percentOfOrderAmount: pctOfOrder(referral),
          },
          {
            key: 'programBenefits',
            label: 'Program benefits',
            amount: programBenefits,
            percentOfOrderAmount: pctOfOrder(programBenefits),
          },
        ],
      },
      {
        key: 'netAmount',
        label: 'Net amount',
        amount: netAmount,
        percentOfOrderAmount: pctOfOrder(netAmount),
      },
    ];

    const trendDays = payments.map((p: any) => ({
      date: p.paymentDate as string,
      netAmount: round2(Number(p.netAmount ?? 0)),
    }));
    const averageDaily = round2(netAmount / trendDays.length);
    const highest = trendDays.reduce(
      (best, d) => (!best || d.netAmount > best.netAmount ? d : best),
      null as { date: string; netAmount: number } | null,
    );
    const lowest = trendDays.reduce(
      (worst, d) => (!worst || d.netAmount < worst.netAmount ? d : worst),
      null as { date: string; netAmount: number } | null,
    );

    const paymentIds = payments.map((p: any) => p.meeshoPaymentId as string);
    const details = paymentIds.length
      ? await this.detailModel.findAll({
          where: { userId, meeshoPaymentId: paymentIds },
          raw: true,
        })
      : [];

    const hasDetails = details.length > 0;
    let delivered = 0;
    let returned = 0;
    let rto = 0;
    let other = 0;
    const bySku = new Map<
      string,
      {
        orders: number;
        delivered: number;
        returned: number;
        rto: number;
        netOrderAmount: number;
      }
    >();

    for (const row of details as any[]) {
      const bucket = bucketOrderStatus(row.orderStatus);
      if (bucket === 'delivered') delivered++;
      else if (bucket === 'return') returned++;
      else if (bucket === 'rto') rto++;
      else other++;

      const sku = (row.sku as string | null) ?? 'Unknown SKU';
      const entry = bySku.get(sku) ?? {
        orders: 0,
        delivered: 0,
        returned: 0,
        rto: 0,
        netOrderAmount: 0,
      };
      entry.orders++;
      if (bucket === 'delivered') entry.delivered++;
      if (bucket === 'return') entry.returned++;
      if (bucket === 'rto') entry.rto++;
      entry.netOrderAmount += Number(row.netOrderAmount ?? 0);
      bySku.set(sku, entry);
    }

    const totalOrders = details.length;
    const rate = (n: number): number =>
      totalOrders > 0 ? round2((n / totalOrders) * 100) : 0;

    const skuRows = [...bySku.entries()].map(([sku, s]) => ({
      sku,
      orders: s.orders,
      delivered: s.delivered,
      returned: s.returned,
      rto: s.rto,
      netOrderAmount: round2(s.netOrderAmount),
      deliveredRate: s.orders > 0 ? round2((s.delivered / s.orders) * 100) : 0,
      returnRate: s.orders > 0 ? round2((s.returned / s.orders) * 100) : 0,
      rtoRate: s.orders > 0 ? round2((s.rto / s.orders) * 100) : 0,
    }));

    const top = [...skuRows]
      .sort((a, b) => b.netOrderAmount - a.netOrderAmount)
      .slice(0, 5)
      .map(
        ({ sku, orders, delivered: d, netOrderAmount: n, deliveredRate }) => ({
          sku,
          orders,
          delivered: d,
          netOrderAmount: n,
          deliveredRate,
        }),
      );

    // "Needs attention": enough volume to be meaningful (>=3 orders) and a
    // real problem rate, worst first.
    const needsAttention = skuRows
      .filter((s) => s.orders >= 3 && s.returnRate + s.rtoRate > 0)
      .sort((a, b) => b.returnRate + b.rtoRate - (a.returnRate + a.rtoRate))
      .slice(0, 5)
      .map(({ sku, orders, returned: r, rto: rt, returnRate, rtoRate }) => ({
        sku,
        orders,
        returned: r,
        rto: rt,
        returnRate,
        rtoRate,
      }));

    return {
      range: { days: rangeDays, from: fromDate, to: toDate },
      availableRanges,
      hasPayments: true,
      earnings: {
        totalOrderAmount,
        platformRecovery,
        platformCompensation,
        netAmount,
      },
      moneyBreakdown,
      trend: {
        days: trendDays,
        averageDaily,
        highest: highest
          ? { date: highest.date, amount: highest.netAmount }
          : null,
        lowest: lowest ? { date: lowest.date, amount: lowest.netAmount } : null,
      },
      orderOutcome: {
        hasDetails,
        totalOrders,
        delivered,
        returned,
        rto,
        other,
        deliveredRate: rate(delivered),
        returnRate: rate(returned),
        rtoRate: rate(rto),
      },
      skuPerformance: { hasDetails, top, needsAttention },
    };
  }

  /**
   * Profitability for the Finance page's Profitability / Product
   * Profitability / Return intelligence sections. Net revenue and Meesho
   * deductions come straight from meesho_payments; product/packaging/other
   * cost comes from seller-entered ProductCost rows (config.product_costs)
   * matched by SKU against meesho_payment_details. Any SKU without a
   * configured cost contributes 0 cost (hasCost: false on its row) - never
   * invented.
   */
  async getProfitability(
    userId: string,
    rangeDays: FinanceRangeDays,
  ): Promise<ProfitabilityAnalytics> {
    const today = new Date();
    const toDate = toDateOnly(today);
    const fromDate = rangeStart(today, rangeDays);

    const [payments, costs] = await Promise.all([
      this.paymentModel.findAll({
        where: {
          userId,
          paymentDate: { [Op.gte]: fromDate, [Op.lte]: toDate },
        },
        raw: true,
      }),
      this.productCostsService.mapForUser(userId),
    ]);

    const hasProductCosts = costs.size > 0;
    const emptyOverview: ProfitabilityOverview = {
      grossRevenue: 0,
      meeshoDeductions: 0,
      netRevenue: 0,
      productCost: 0,
      packagingCost: 0,
      otherCost: 0,
      estimatedProfit: 0,
      profitMargin: 0,
      meeshoCostPercent: 0,
      returnLoss: 0,
    };

    if (payments.length === 0) {
      return {
        range: { days: rangeDays, from: fromDate, to: toDate },
        hasPayments: false,
        hasDetails: false,
        hasProductCosts,
        overview: emptyOverview,
        products: [],
        returns: {
          returnRate: 0,
          returnedOrders: 0,
          rtoOrders: 0,
          returnLoss: 0,
          recoveryCharges: 0,
          byProduct: [],
        },
        insights: [],
      };
    }

    const sumField = (key: keyof MeeshoPayment): number =>
      round2(
        payments.reduce((acc, p) => acc + Number((p as any)[key] ?? 0), 0),
      );

    const grossRevenue = sumField('orderAmount');
    const netAmount = sumField('netAmount');
    const meeshoDeductions = round2(grossRevenue - netAmount);

    const pctOfGross = (amount: number): number =>
      grossRevenue > 0 ? round2((amount / grossRevenue) * 100) : 0;

    const paymentIds = payments.map((p: any) => p.meeshoPaymentId as string);
    const details = paymentIds.length
      ? ((await this.detailModel.findAll({
          where: { userId, meeshoPaymentId: paymentIds },
          raw: true,
        })) as any[])
      : [];
    const hasDetails = details.length > 0;

    const bySku = new Map<
      string,
      {
        orders: number;
        revenue: number;
        netRevenue: number;
        delivered: number;
        returned: number;
        rto: number;
      }
    >();

    let returnedOrders = 0;
    let rtoOrders = 0;
    let recoveryCharges = 0;

    for (const row of details) {
      const bucket = bucketOrderStatus(row.orderStatus);
      if (bucket === 'return') returnedOrders++;
      if (bucket === 'rto') rtoOrders++;
      recoveryCharges += Number(row.recoveriesCharges ?? 0);

      const sku = (row.sku as string | null) ?? 'Unknown SKU';
      const entry = bySku.get(sku) ?? {
        orders: 0,
        revenue: 0,
        netRevenue: 0,
        delivered: 0,
        returned: 0,
        rto: 0,
      };
      entry.orders++;
      entry.revenue += Number(row.orderAmount ?? 0);
      entry.netRevenue += Number(row.netOrderAmount ?? 0);
      if (bucket === 'delivered') entry.delivered++;
      if (bucket === 'return') entry.returned++;
      if (bucket === 'rto') entry.rto++;
      bySku.set(sku, entry);
    }
    recoveryCharges = round2(recoveryCharges);

    let totalProductCost = 0;
    let totalPackagingCost = 0;
    let totalOtherCost = 0;
    let returnLoss = 0;

    const productRows: ProductProfitabilityRow[] = [...bySku.entries()].map(
      ([sku, s]) => {
        const cost = costs.get(sku);
        const hasCost = !!cost;
        const unitCost = cost
          ? round2(cost.productCost + cost.packagingCost + cost.otherCost)
          : 0;
        const skuProductCost = round2((cost?.productCost ?? 0) * s.orders);
        const skuPackagingCost = round2((cost?.packagingCost ?? 0) * s.orders);
        const skuOtherCost = round2((cost?.otherCost ?? 0) * s.orders);
        const meeshoCost = round2(s.revenue - s.netRevenue);
        const estimatedProfit = round2(
          s.netRevenue - skuProductCost - skuPackagingCost - skuOtherCost,
        );
        const margin =
          s.netRevenue > 0 ? round2((estimatedProfit / s.netRevenue) * 100) : 0;
        const badOrders = s.returned + s.rto;
        const returnRate =
          s.orders > 0 ? round2((badOrders / s.orders) * 100) : 0;
        const estimatedLoss = round2(unitCost * badOrders);

        totalProductCost += skuProductCost;
        totalPackagingCost += skuPackagingCost;
        totalOtherCost += skuOtherCost;
        returnLoss += estimatedLoss;

        return {
          sku,
          orders: s.orders,
          revenue: round2(s.revenue),
          netRevenue: round2(s.netRevenue),
          meeshoCost,
          hasCost,
          productCost: skuProductCost,
          packagingCost: skuPackagingCost,
          otherCost: skuOtherCost,
          estimatedProfit,
          margin,
          delivered: s.delivered,
          returned: s.returned,
          rto: s.rto,
          returnRate,
          estimatedLoss,
        };
      },
    );
    productRows.sort((a, b) => b.netRevenue - a.netRevenue);

    totalProductCost = round2(totalProductCost);
    totalPackagingCost = round2(totalPackagingCost);
    totalOtherCost = round2(totalOtherCost);
    returnLoss = round2(returnLoss);

    const estimatedProfit = round2(
      netAmount - totalProductCost - totalPackagingCost - totalOtherCost,
    );
    const profitMargin =
      netAmount > 0 ? round2((estimatedProfit / netAmount) * 100) : 0;

    const overview: ProfitabilityOverview = {
      grossRevenue,
      meeshoDeductions,
      netRevenue: netAmount,
      productCost: totalProductCost,
      packagingCost: totalPackagingCost,
      otherCost: totalOtherCost,
      estimatedProfit,
      profitMargin,
      meeshoCostPercent: pctOfGross(meeshoDeductions),
      returnLoss,
    };

    const totalOrders = details.length;
    const rate = (n: number): number =>
      totalOrders > 0 ? round2((n / totalOrders) * 100) : 0;

    const byProduct = productRows
      .filter((p) => p.returned + p.rto > 0)
      .map((p) => ({
        sku: p.sku,
        orders: p.orders,
        returns: p.returned + p.rto,
        returnRate: p.returnRate,
        estimatedLoss: p.estimatedLoss,
      }))
      .sort((a, b) => b.estimatedLoss - a.estimatedLoss);

    // Prior equal-length window, purely to power the "rising deductions" insight.
    const priorTo = new Date(fromDate);
    priorTo.setUTCDate(priorTo.getUTCDate() - 1);
    const priorFrom = new Date(priorTo);
    priorFrom.setUTCDate(priorFrom.getUTCDate() - (rangeDays - 1));
    const priorPayments = await this.paymentModel.findAll({
      where: {
        userId,
        paymentDate: {
          [Op.gte]: toDateOnly(priorFrom),
          [Op.lte]: toDateOnly(priorTo),
        },
      },
      raw: true,
    });

    const insights: ProfitabilityInsight[] = [];

    if (priorPayments.length > 0) {
      const priorGross = round2(
        priorPayments.reduce(
          (acc: number, p: any) => acc + Number(p.orderAmount ?? 0),
          0,
        ),
      );
      const priorNet = round2(
        priorPayments.reduce(
          (acc: number, p: any) => acc + Number(p.netAmount ?? 0),
          0,
        ),
      );
      const priorPct =
        priorGross > 0
          ? round2(((priorGross - priorNet) / priorGross) * 100)
          : 0;
      if (priorPct > 0 && overview.meeshoCostPercent > priorPct * 1.15) {
        const change = round2(
          ((overview.meeshoCostPercent - priorPct) / priorPct) * 100,
        );
        insights.push({
          type: 'rising_deductions',
          title: 'Rising Deductions',
          message: `Meesho deductions are ${change}% higher as a share of revenue compared with the previous period.`,
          sku: null,
        });
      }
    }

    if (hasProductCosts) {
      const lowMargin = productRows
        .filter((p) => p.hasCost && p.netRevenue > 0 && p.margin < 15)
        .sort((a, b) => b.netRevenue - a.netRevenue)[0];
      if (lowMargin) {
        insights.push({
          type: 'low_margin',
          title: 'Low Margin',
          message: `${lowMargin.sku} is generating ${formatRupees(lowMargin.netRevenue)} in net revenue but only a ${lowMargin.margin}% estimated margin.`,
          sku: lowMargin.sku,
        });
      }

      const strong = productRows
        .filter((p) => p.hasCost && p.margin >= 25 && p.estimatedProfit > 0)
        .sort((a, b) => b.estimatedProfit - a.estimatedProfit)[0];
      if (strong) {
        insights.push({
          type: 'strong_performer',
          title: 'Strong Performer',
          message: `${strong.sku} generated an estimated ${formatRupees(strong.estimatedProfit)} profit at a ${strong.margin}% margin.`,
          sku: strong.sku,
        });
      }
    }

    const highReturns = productRows
      .filter((p) => p.orders >= 3 && p.returnRate > 20)
      .sort((a, b) => b.returnRate - a.returnRate)[0];
    if (highReturns) {
      insights.push({
        type: 'high_returns',
        title: 'High Returns',
        message: `${highReturns.sku} has a ${highReturns.returnRate}% return/RTO rate across the selected period.`,
        sku: highReturns.sku,
      });
    }

    return {
      range: { days: rangeDays, from: fromDate, to: toDate },
      hasPayments: true,
      hasDetails,
      hasProductCosts,
      overview,
      products: productRows,
      returns: {
        returnRate: rate(returnedOrders + rtoOrders),
        returnedOrders,
        rtoOrders,
        returnLoss,
        recoveryCharges,
        byProduct,
      },
      insights: insights.slice(0, 5),
    };
  }
}
