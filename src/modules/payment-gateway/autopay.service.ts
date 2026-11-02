import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Op } from 'sequelize';
import { AppConfig } from '../../config/configuration';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateAutopayDto, VerifyAutopayDto } from './dto/autopay.dto';
import {
  AutopayStatus,
  AutopaySubscription,
  LIVE_AUTOPAY_STATUSES,
} from './models/autopay-subscription.model';
import { Payment, PaymentStatus } from './models/payment.model';
import { RazorpayPlan } from './models/razorpay-plan.model';
import { PaymentsService } from './payments.service';
import {
  AUTOPAY_CYCLE,
  AUTOPAY_GRACE_DAYS,
  AUTOPAY_MIN_LEAD_MS,
  CURRENCY,
  PLAN_PRICING,
} from './plan-pricing';

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The parts of a Razorpay subscription webhook this service reads. */
export interface SubscriptionWebhookBody {
  event?: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        status?: string;
        paid_count?: number;
        /** Unix seconds of the NEXT charge; null after the last cycle. */
        charge_at?: number | null;
      };
    };
    payment?: {
      entity?: { id?: string; order_id?: string | null; amount?: number };
    };
  };
}

/** Webhook event -> the state it puts the subscription in. */
const EVENT_STATUS: Record<string, AutopayStatus> = {
  'subscription.authenticated': AutopayStatus.AUTHENTICATED,
  'subscription.activated': AutopayStatus.ACTIVE,
  'subscription.charged': AutopayStatus.ACTIVE,
  'subscription.resumed': AutopayStatus.ACTIVE,
  'subscription.pending': AutopayStatus.PENDING,
  'subscription.halted': AutopayStatus.HALTED,
  'subscription.paused': AutopayStatus.PAUSED,
  'subscription.cancelled': AutopayStatus.CANCELLED,
  'subscription.completed': AutopayStatus.COMPLETED,
};

/**
 * Optional autopay after a one-time purchase. The user first pays for the
 * plan through the normal order flow (PaymentsService). Autopay then creates
 * a Razorpay subscription that STARTS when that paid period ends, so nothing
 * is charged twice. Setting it up costs a small authorisation payment that
 * Razorpay refunds itself, and grants no access. Each later renewal arrives
 * as a `subscription.charged` webhook and is recorded and fulfilled exactly
 * like a normal purchase.
 */
@Injectable()
export class AutopayService {
  private readonly logger = new Logger(AutopayService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @InjectModel(AutopaySubscription)
    private readonly autopayModel: typeof AutopaySubscription,
    @InjectModel(RazorpayPlan)
    private readonly planModel: typeof RazorpayPlan,
    @InjectModel(Payment) private readonly paymentModel: typeof Payment,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly payments: PaymentsService,
  ) {}

  private get razorpay() {
    return this.configService.getOrThrow('razorpay', { infer: true });
  }

  private async call<T>(
    method: 'POST',
    path: string,
    body: object,
  ): Promise<T> {
    const { keyId, keySecret } = this.razorpay;
    if (!keyId || !keySecret) {
      this.logger.error(
        'RAZORPAY_API_KEY / RAZORPAY_KEY_SECRET not configured',
      );
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const res = await fetch(`${RAZORPAY_API}${path}`, {
      method,
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      this.logger.error(
        `Razorpay ${path} failed: ${res.status} ${await res.text()}`,
      );
      throw new BadGatewayException('Could not reach the payment provider');
    }
    return (await res.json()) as T;
  }

  /** The Razorpay plan for this price, created once and then reused. */
  private async getOrCreatePlan(
    planCode: string,
    interval: CreateAutopayDto['interval'],
    amount: number,
  ): Promise<RazorpayPlan> {
    const existing = await this.planModel.findOne({
      where: { planCode, interval, amount },
    });
    if (existing) return existing;

    const cycle = AUTOPAY_CYCLE[interval];
    const plan = await this.call<{ id: string }>('POST', '/plans', {
      period: cycle.period,
      interval: cycle.interval,
      item: {
        name: `Rocket Listing ${planCode} (${interval})`,
        amount,
        currency: CURRENCY,
      },
      notes: { planCode, interval },
    });
    try {
      return await this.planModel.create({
        planCode,
        interval,
        amount,
        razorpayPlanId: plan.id,
      });
    } catch (err) {
      // Two first-time requests raced: keep the row that won.
      const winner = await this.planModel.findOne({
        where: { planCode, interval, amount },
      });
      if (winner) return winner;
      throw err;
    }
  }

  /**
   * Step 1: create the subscription for the user's current paid period.
   * Returns what Razorpay Checkout needs (`subscription_id`).
   */
  async start(userId: string, dto: CreateAutopayDto) {
    const price = PLAN_PRICING[dto.planCode]?.[dto.interval];
    if (!price) {
      throw new BadRequestException(
        `${dto.planCode} (${dto.interval}) is not available for autopay`,
      );
    }

    const current =
      await this.subscriptionsService.getCurrentSubscription(userId);
    const periodEnd = current?.currentPeriodEnd;
    if (current?.plan?.code !== dto.planCode || !periodEnd) {
      throw new BadRequestException('Buy the plan first, then turn on autopay');
    }

    const now = Date.now();
    const live = await this.autopayModel.findOne({
      where: { userId, status: { [Op.in]: LIVE_AUTOPAY_STATUSES } },
      order: [['createdAt', 'DESC']],
    });
    if (live) {
      const stillOpen =
        live.status === AutopayStatus.CREATED &&
        live.startAt.getTime() > now + AUTOPAY_MIN_LEAD_MS;
      if (stillOpen) return this.checkoutPayload(live);
      if (live.status !== AutopayStatus.CREATED) {
        throw new ConflictException('Autopay is already set up');
      }
      // An abandoned, never-authorised subscription whose start date has passed.
      await live.update({
        status: AutopayStatus.CANCELLED,
        cancelledAt: new Date(),
      });
    }

    const startAtMs = Math.max(periodEnd.getTime(), now + AUTOPAY_MIN_LEAD_MS);
    const plan = await this.getOrCreatePlan(
      dto.planCode,
      dto.interval,
      price.amount,
    );
    const cycle = AUTOPAY_CYCLE[dto.interval];
    const sub = await this.call<{ id: string }>('POST', '/subscriptions', {
      plan_id: plan.razorpayPlanId,
      total_count: cycle.totalCount,
      start_at: Math.ceil(startAtMs / 1000),
      customer_notify: true,
      notes: { userId, planCode: dto.planCode, interval: dto.interval },
    });

    const row = await this.autopayModel.create({
      autopayId: randomUUID(),
      userId,
      planCode: dto.planCode,
      interval: dto.interval,
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: plan.razorpayPlanId,
      startAt: new Date(startAtMs),
      totalCount: cycle.totalCount,
    });
    return this.checkoutPayload(row);
  }

  private checkoutPayload(row: AutopaySubscription) {
    return {
      keyId: this.razorpay.keyId,
      subscriptionId: row.razorpaySubscriptionId,
      planCode: row.planCode,
      interval: row.interval,
      firstRenewalAt: row.startAt,
    };
  }

  /**
   * Step 2: Checkout reports back. The signature is checked against the
   * subscription id we stored (never the one the browser sends). Grants
   * nothing: the user already has the plan they paid for.
   */
  async verify(userId: string, dto: VerifyAutopayDto) {
    const row = await this.autopayModel.findOne({
      where: { userId, razorpaySubscriptionId: dto.razorpay_subscription_id },
    });
    if (!row) throw new NotFoundException('Autopay not found');

    const { keySecret } = this.razorpay;
    if (!keySecret)
      throw new ServiceUnavailableException('Payments are not configured');
    const expected = createHmac('sha256', keySecret)
      .update(`${dto.razorpay_payment_id}|${row.razorpaySubscriptionId}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(dto.razorpay_signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid payment signature');
    }

    // The webhook may already have moved it on; never step backwards.
    if (row.status === AutopayStatus.CREATED) {
      await row.update({ status: AutopayStatus.AUTHENTICATED });
    }
    return this.describe(row);
  }

  /** Stops autopay. The user keeps the access they already paid for. */
  async cancel(userId: string) {
    const row = await this.autopayModel.findOne({
      where: { userId, status: { [Op.in]: LIVE_AUTOPAY_STATUSES } },
      order: [['createdAt', 'DESC']],
    });
    if (!row) throw new NotFoundException('No autopay to cancel');

    // Razorpay only allows "at the end of the cycle" while a cycle is running.
    const atCycleEnd = row.status === AutopayStatus.ACTIVE;
    await this.call(
      'POST',
      `/subscriptions/${row.razorpaySubscriptionId}/cancel`,
      {
        cancel_at_cycle_end: atCycleEnd,
      },
    );
    const now = new Date();
    await row.update(
      atCycleEnd
        ? { cancelRequestedAt: now }
        : { status: AutopayStatus.CANCELLED, cancelledAt: now },
    );
    return this.describe(row);
  }

  /** The user's current autopay, or null. */
  async mine(userId: string) {
    const row = await this.autopayModel.findOne({
      where: { userId, status: { [Op.in]: LIVE_AUTOPAY_STATUSES } },
      order: [['createdAt', 'DESC']],
    });
    return row ? this.describe(row) : null;
  }

  private describe(row: AutopaySubscription) {
    return {
      planCode: row.planCode,
      interval: row.interval,
      status: row.status,
      nextRenewalAt: row.startAt,
      cancelRequested: !!row.cancelRequestedAt,
    };
  }

  /** Applies one `subscription.*` webhook. Idempotent, so Razorpay's retries are safe. */
  async handleEvent(event: string, body: SubscriptionWebhookBody) {
    const sub = body.payload?.subscription?.entity;
    if (!sub?.id) return;
    const row = await this.autopayModel.findOne({
      where: { razorpaySubscriptionId: sub.id },
    });
    if (!row) {
      this.logger.warn(`${event}: unknown subscription ${sub.id}`);
      return;
    }

    const status = EVENT_STATUS[event];
    if (!status) {
      this.logger.debug(`Unhandled subscription event ${event}`);
      return;
    }

    const patch: Partial<AutopaySubscription> = {};
    // A late "authenticated" must not undo "active".
    const rank = (s: AutopayStatus) =>
      s === AutopayStatus.CREATED
        ? 0
        : s === AutopayStatus.AUTHENTICATED
          ? 1
          : 2;
    const stepsBack =
      status === AutopayStatus.AUTHENTICATED && rank(row.status) > rank(status);
    if (!stepsBack) patch.status = status;
    if (typeof sub.paid_count === 'number' && sub.paid_count > row.paidCount) {
      patch.paidCount = sub.paid_count;
    }
    if (status === AutopayStatus.CANCELLED && !row.cancelledAt) {
      patch.cancelledAt = new Date();
    }
    if (typeof sub.charge_at === 'number' && event === 'subscription.charged') {
      patch.startAt = new Date(sub.charge_at * 1000);
    }

    if (event === 'subscription.charged') {
      await this.recordCharge(row, body);
      patch.lastChargedAt = new Date();
    }
    if (Object.keys(patch).length) await row.update(patch);
  }

  /** A renewal was charged: ledger row + access, exactly once per Razorpay payment. */
  private async recordCharge(
    row: AutopaySubscription,
    body: SubscriptionWebhookBody,
  ) {
    const pay = body.payload?.payment?.entity;
    const sub = body.payload?.subscription?.entity;
    if (!pay?.id || typeof pay.amount !== 'number') {
      throw new Error(
        `subscription.charged for ${row.razorpaySubscriptionId} has no payment`,
      );
    }
    // The amount this subscription's plan was created with (the price may have changed since).
    const plan = await this.planModel.findOne({
      where: { razorpayPlanId: row.razorpayPlanId },
    });
    if (!plan) throw new Error(`Unknown Razorpay plan ${row.razorpayPlanId}`);

    // Razorpay makes an order per invoice; fall back to the payment id so the key is always unique.
    const orderId = pay.order_id || `sub_${pay.id}`;
    await this.paymentModel.findOrCreate({
      where: { razorpayOrderId: orderId },
      defaults: {
        paymentId: randomUUID(),
        userId: row.userId,
        planCode: row.planCode,
        interval: row.interval,
        amount: plan.amount,
        currency: CURRENCY,
        razorpayOrderId: orderId,
        status: PaymentStatus.CREATED,
      } as Partial<Payment>,
    });

    const accessUntil =
      typeof sub?.charge_at === 'number'
        ? new Date(sub.charge_at * 1000 + AUTOPAY_GRACE_DAYS * DAY_MS)
        : undefined;
    await this.payments.fulfill(orderId, pay.id, pay.amount, { accessUntil });
  }
}
