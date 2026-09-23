import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MeeshoPayment } from './models/meesho-payment.model';
import { MeeshoPaymentDetail } from './models/meesho-payment-detail.model';
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

@Injectable()
export class MeeshoPaymentsService {
  constructor(
    @InjectModel(MeeshoPayment)
    private readonly paymentModel: typeof MeeshoPayment,
    @InjectModel(MeeshoPaymentDetail)
    private readonly detailModel: typeof MeeshoPaymentDetail,
    private readonly subscriptionsService: SubscriptionsService,
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
    // slipping in between the lookup above and this insert.
    if (fresh.length) {
      await this.paymentModel.bulkCreate(fresh, { ignoreDuplicates: true });
    }

    return {
      received: dto.payments.length,
      inserted: fresh.length,
      skipped: dto.payments.length - fresh.length,
    };
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

    return {
      received: dto.details.length,
      inserted: fresh.length,
      skipped: dto.details.length - fresh.length,
    };
  }
}
