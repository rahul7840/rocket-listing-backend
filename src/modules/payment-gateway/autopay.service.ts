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
/** How long a row may look out of date (unapproved, or next charge passed) before we ask Razorpay. */
const SYNC_AFTER_MS = 60 * 1000;
/** A checkout still unapproved after this long was abandoned; close it so it stops showing up. */
const ABANDON_AFTER_MS = 60 * 60 * 1000;

/**
 * Razorpay answered but refused the request (any non-2xx). The message the
 * user sees stays generic; `description` keeps Razorpay's reason for callers
 * and the logs.
 */
export class RazorpayApiError extends BadGatewayException {
  constructor(
    readonly httpStatus: number,
    readonly description: string,
  ) {
    super(
      'The payment provider refused this request. Please try again, or contact support if it keeps happening.',
    );
  }

  /** Razorpay does not know this id (another account, or a test/live key mix-up). */
  get notFound(): boolean {
    return this.httpStatus === 404 || /does not exist/i.test(this.description);
  }
}

/** Razorpay's `error.description`, or the raw text when the body is not its JSON. */
function razorpayErrorDescription(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { description?: string } };
    return parsed.error?.description ?? text;
  } catch {
    return text;
  }
}

/** The fields of Razorpay's subscription entity this service reads. */
interface RemoteSubscription {
  id?: string;
  status: string;
  /** Unix seconds of the next charge. */
  charge_at?: number | null;
  paid_count?: number;
  remaining_count?: number | null;
}

/** The fields of a Razorpay invoice this service reads. */
interface RemoteInvoice {
  status?: string;
  payment_id?: string | null;
  order_id?: string | null;
  amount?: number;
  amount_paid?: number;
}

/** Razorpay statuses after which a subscription can never charge again. */
const ENDED_REMOTE: Partial<Record<string, AutopayStatus>> = {
  cancelled: AutopayStatus.CANCELLED,
  completed: AutopayStatus.COMPLETED,
  expired: AutopayStatus.EXPIRED,
};

const KNOWN_STATUSES = new Set<string>(Object.values(AutopayStatus));

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
 * Subscribe-and-pay in one step. A user with no paid time left approves the
 * mandate and pays the first cycle in the same Razorpay Checkout (the
 * subscription has no start_at, so Razorpay charges at once). A user who
 * still has paid time keeps it: the subscription STARTS when that period
 * ends (small refunded authorisation payment, no access granted). Each later
 * renewal arrives
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
    method: 'GET' | 'POST',
    path: string,
    body?: object,
  ): Promise<T> {
    const { keyId, keySecret } = this.razorpay;
    if (!keyId || !keySecret) {
      this.logger.error(
        'RAZORPAY_API_KEY / RAZORPAY_KEY_SECRET not configured',
      );
      throw new ServiceUnavailableException('Payments are not configured');
    }
    let res: Response;
    try {
      res = await fetch(`${RAZORPAY_API}${path}`, {
        method,
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      // Network error or timeout: Razorpay never answered.
      this.logger.error(
        `Razorpay ${method} ${path} unreachable: ${String(err)}`,
      );
      throw new BadGatewayException(
        'Could not reach the payment provider. Please try again in a minute.',
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        `Razorpay ${method} ${path} failed: ${res.status} ${text}`,
      );
      throw new RazorpayApiError(res.status, razorpayErrorDescription(text));
    }
    return (await res.json()) as T;
  }

  /** The user's newest subscription that is not finished (it may still be unapproved). */
  private findLive(userId: string) {
    return this.autopayModel.findOne({
      where: { userId, status: { [Op.in]: LIVE_AUTOPAY_STATUSES } },
      order: [['createdAt', 'DESC']],
    });
  }

  /** Razorpay's copy of a subscription, or null when Razorpay does not know the id. */
  private async fetchRemote(
    subscriptionId: string,
  ): Promise<RemoteSubscription | null> {
    try {
      return await this.call<RemoteSubscription>(
        'GET',
        `/subscriptions/${subscriptionId}`,
      );
    } catch (err) {
      if (err instanceof RazorpayApiError && err.notFound) return null;
      throw err;
    }
  }

  /**
   * Brings our row in line with Razorpay, for when a webhook was missed:
   * status, next charge date, and any charge Razorpay took that we have not
   * recorded yet (through the same idempotent path the webhook uses).
   */
  private async sync(row: AutopaySubscription): Promise<void> {
    const remote = await this.fetchRemote(row.razorpaySubscriptionId);
    if (!remote) {
      // Not on this Razorpay account, so it can never charge through it.
      this.logger.warn(
        `Autopay ${row.razorpaySubscriptionId} is unknown to Razorpay; closing it`,
      );
      await this.closeIfEnded(row, null);
      return;
    }

    const paidCount = remote.paid_count ?? 0;
    if (paidCount > row.paidCount) await this.recordMissedCharges(row, remote);

    const patch: Partial<AutopaySubscription> = {};
    if (KNOWN_STATUSES.has(remote.status) && remote.status !== row.status) {
      patch.status = remote.status as AutopayStatus;
    }
    // While unapproved the start date is ours; after that Razorpay's next charge is the truth.
    if (remote.status !== 'created' && typeof remote.charge_at === 'number') {
      const next = new Date(remote.charge_at * 1000);
      if (next.getTime() !== row.startAt.getTime()) patch.startAt = next;
    }
    if (paidCount > row.paidCount) {
      patch.paidCount = paidCount;
      patch.lastChargedAt = new Date();
    }
    if (remote.status === 'cancelled' && !row.cancelledAt) {
      patch.cancelledAt = new Date();
    }
    if (Object.keys(patch).length) await row.update(patch);
  }

  /** Records every paid invoice of the subscription; ones already recorded are skipped by fulfill(). */
  private async recordMissedCharges(
    row: AutopaySubscription,
    remote: RemoteSubscription,
  ) {
    const plan = await this.planModel.findOne({
      where: { razorpayPlanId: row.razorpayPlanId },
    });
    const { items = [] } = await this.call<{ items?: RemoteInvoice[] }>(
      'GET',
      `/invoices?subscription_id=${encodeURIComponent(row.razorpaySubscriptionId)}`,
    );
    for (const invoice of items) {
      const amount = invoice.amount_paid ?? invoice.amount;
      if (invoice.status !== 'paid' || !invoice.payment_id) continue;
      // Only full cycle charges grant access (never a refunded authorisation payment).
      if (!plan || amount !== plan.amount) continue;
      this.logger.warn(
        `Recording autopay charge ${invoice.payment_id} found by sync (webhook missed?)`,
      );
      await this.recordCharge(
        row,
        { id: invoice.payment_id, amount, order_id: invoice.order_id },
        remote.charge_at,
      );
    }
  }

  /**
   * Syncs a row that looks out of date: still unapproved a minute after
   * checkout, or its next charge date has passed. Closes a checkout that was
   * abandoned long ago. Never throws, so the plan page loads even when
   * Razorpay is down.
   */
  private async refreshIfStale(row: AutopaySubscription): Promise<void> {
    const now = Date.now();
    const age = now - row.createdAt.getTime();
    const unapproved = row.status === AutopayStatus.CREATED;
    const stale = unapproved
      ? age > SYNC_AFTER_MS
      : row.startAt.getTime() < now - SYNC_AFTER_MS;
    if (!stale) return;
    try {
      await this.sync(row);
      if (row.status === AutopayStatus.CREATED && age > ABANDON_AFTER_MS) {
        await this.closeUnapproved(row);
      }
    } catch (err) {
      this.logger.warn(
        `Could not refresh autopay ${row.razorpaySubscriptionId}: ${String(err)}`,
      );
    }
  }

  /** Cancels a never-approved subscription at Razorpay (best effort) and closes our row. */
  private async closeUnapproved(row: AutopaySubscription) {
    await this.call(
      'POST',
      `/subscriptions/${row.razorpaySubscriptionId}/cancel`,
      { cancel_at_cycle_end: false },
    ).catch((err: unknown) =>
      this.logger.warn(`Could not cancel unapproved autopay: ${String(err)}`),
    );
    await row.update({
      status: AutopayStatus.CANCELLED,
      cancelledAt: new Date(),
    });
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

    // A user who still has paid time keeps it: autopay then starts when that
    // period ends. Everyone else (new, free or lapsed) pays the first cycle
    // right now, in the same Razorpay Checkout that sets up the mandate.
    const current =
      await this.subscriptionsService.getCurrentSubscription(userId);
    const periodEnd = current?.currentPeriodEnd;
    const now = Date.now();
    const hasPaidTimeLeft =
      current?.plan?.code === dto.planCode &&
      !!periodEnd &&
      periodEnd.getTime() > now + AUTOPAY_MIN_LEAD_MS;

    let live = await this.findLive(userId);
    // Our row can be out of date (a missed webhook, a mandate cancelled from
    // the UPI app, a checkout paid but never verified), so ask Razorpay first.
    // A checkout opened under a minute ago is reused as it is.
    if (
      live &&
      (live.status !== AutopayStatus.CREATED ||
        now - live.createdAt.getTime() > SYNC_AFTER_MS)
    ) {
      await this.sync(live);
      if (!LIVE_AUTOPAY_STATUSES.includes(live.status)) live = null;
    }
    if (live) {
      const stillOpen =
        live.status === AutopayStatus.CREATED &&
        live.planCode === dto.planCode &&
        live.interval === dto.interval &&
        (this.isImmediate(live)
          ? !hasPaidTimeLeft
          : live.startAt.getTime() > now + AUTOPAY_MIN_LEAD_MS);
      if (stillOpen) return this.checkoutPayload(live);
      if (live.status !== AutopayStatus.CREATED) {
        throw new ConflictException('Autopay is already set up');
      }
      // An abandoned, never-authorised subscription that can't be reused.
      await this.closeUnapproved(live);
    }

    // Immediate: no start_at, so Razorpay charges the first cycle as soon as
    // the user approves. Delayed: start when the paid period ends.
    const startAtMs = hasPaidTimeLeft
      ? Math.max(periodEnd!.getTime(), now + AUTOPAY_MIN_LEAD_MS)
      : now;
    const plan = await this.getOrCreatePlan(
      dto.planCode,
      dto.interval,
      price.amount,
    );
    const cycle = AUTOPAY_CYCLE[dto.interval];
    const sub = await this.call<{ id: string }>('POST', '/subscriptions', {
      plan_id: plan.razorpayPlanId,
      total_count: cycle.totalCount,
      ...(hasPaidTimeLeft ? { start_at: Math.ceil(startAtMs / 1000) } : {}),
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

  /** True when the first cycle is charged at approval (no earlier paid time). */
  private isImmediate(row: AutopaySubscription): boolean {
    return (
      row.startAt.getTime() - row.createdAt.getTime() < AUTOPAY_MIN_LEAD_MS
    );
  }

  private checkoutPayload(row: AutopaySubscription) {
    return {
      keyId: this.razorpay.keyId,
      subscriptionId: row.razorpaySubscriptionId,
      planCode: row.planCode,
      interval: row.interval,
      firstRenewalAt: row.startAt,
      chargedNow: this.isImmediate(row),
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

    // One-step purchase: this payment IS the first cycle, so grant the plan
    // now instead of waiting for the webhook. Idempotent with the webhook.
    if (this.isImmediate(row)) await this.fulfillFirstCharge(row, dto);
    return this.describe(row);
  }

  /**
   * Looks the payment up at Razorpay (never trusting the browser for the
   * amount or status) and grants the first cycle if it was really captured.
   */
  private async fulfillFirstCharge(
    row: AutopaySubscription,
    dto: VerifyAutopayDto,
  ) {
    const pay = await this.call<{
      id: string;
      status: string;
      amount: number;
      order_id?: string | null;
      subscription_id?: string | null;
    }>('GET', `/payments/${dto.razorpay_payment_id}`);
    if (
      pay.subscription_id !== row.razorpaySubscriptionId ||
      pay.status !== 'captured'
    ) {
      // Not charged (yet): the webhook will finish the job if it is.
      this.logger.warn(
        `First autopay payment ${pay.id} is ${pay.status}; waiting for webhook`,
      );
      return;
    }
    const sub = await this.call<{
      paid_count?: number;
      charge_at?: number | null;
    }>('GET', `/subscriptions/${row.razorpaySubscriptionId}`);
    await this.recordCharge(row, pay, sub.charge_at);
    await row.update({
      status: AutopayStatus.ACTIVE,
      lastChargedAt: new Date(),
      paidCount: Math.max(row.paidCount, sub.paid_count ?? 1),
      ...(typeof sub.charge_at === 'number'
        ? { startAt: new Date(sub.charge_at * 1000) }
        : {}),
    });
  }

  /**
   * Stops autopay. The user keeps the access they already paid for.
   * Razorpay's own status decides how: a running paid cycle stops at its end,
   * anything not charging yet stops at once, and one that already ended
   * (expired, cancelled from the UPI app, completed) only needs our row closed.
   */
  async cancel(userId: string) {
    const row = await this.findLive(userId);
    if (!row) throw new NotFoundException('No autopay to cancel');

    const remote = await this.fetchRemote(row.razorpaySubscriptionId);
    if (!remote) {
      this.logger.warn(
        `Autopay ${row.razorpaySubscriptionId} is unknown to Razorpay; closing it`,
      );
      await this.closeIfEnded(row, null);
      return this.describe(row);
    }
    if (await this.closeIfEnded(row, remote)) return this.describe(row);

    // In its last paid cycle nothing more will be charged, and Razorpay
    // refuses a cycle-end cancel, so there is nothing to call.
    if (remote.status === 'active' && remote.remaining_count === 0) {
      await row.update({
        status: AutopayStatus.ACTIVE,
        cancelRequestedAt: new Date(),
      });
      return this.describe(row);
    }

    // Razorpay only allows "at the end of the cycle" while a cycle is running.
    const atCycleEnd = remote.status === 'active';
    try {
      await this.call(
        'POST',
        `/subscriptions/${row.razorpaySubscriptionId}/cancel`,
        { cancel_at_cycle_end: atCycleEnd },
      );
    } catch (err) {
      // It may have ended in between (e.g. cancelled from the UPI app).
      if (!(err instanceof RazorpayApiError)) throw err;
      const again = await this.fetchRemote(row.razorpaySubscriptionId);
      if (await this.closeIfEnded(row, again)) return this.describe(row);
      throw err;
    }
    const now = new Date();
    await row.update(
      atCycleEnd
        ? { status: AutopayStatus.ACTIVE, cancelRequestedAt: now }
        : { status: AutopayStatus.CANCELLED, cancelledAt: now },
    );
    return this.describe(row);
  }

  /**
   * Closes our row when Razorpay's subscription can no longer charge: it
   * ended, or Razorpay does not know it (`remote` null). Returns true if so.
   */
  private async closeIfEnded(
    row: AutopaySubscription,
    remote: RemoteSubscription | null,
  ): Promise<boolean> {
    const ended = remote
      ? ENDED_REMOTE[remote.status]
      : AutopayStatus.CANCELLED;
    if (!ended) return false;
    await row.update({
      status: ended,
      ...(ended === AutopayStatus.CANCELLED && !row.cancelledAt
        ? { cancelledAt: new Date() }
        : {}),
    });
    return true;
  }

  /**
   * The user's autopay, or null. A checkout the user never approved is not
   * autopay, so it is not reported as "on".
   */
  async mine(userId: string) {
    const row = await this.findLive(userId);
    if (!row) return null;
    await this.refreshIfStale(row);
    if (
      row.status === AutopayStatus.CREATED ||
      !LIVE_AUTOPAY_STATUSES.includes(row.status)
    ) {
      return null;
    }
    return this.describe(row);
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
      await this.recordChargeFromWebhook(row, body);
      patch.lastChargedAt = new Date();
    }
    if (Object.keys(patch).length) await row.update(patch);
  }

  /** A renewal was charged: ledger row + access, exactly once per Razorpay payment. */
  private async recordChargeFromWebhook(
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
    await this.recordCharge(
      row,
      { id: pay.id, amount: pay.amount, order_id: pay.order_id },
      sub?.charge_at,
    );
  }

  private async recordCharge(
    row: AutopaySubscription,
    pay: { id: string; amount: number; order_id?: string | null },
    nextChargeAt?: number | null,
  ) {
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
      typeof nextChargeAt === 'number'
        ? new Date(nextChargeAt * 1000 + AUTOPAY_GRACE_DAYS * DAY_MS)
        : undefined;
    await this.payments.fulfill(orderId, pay.id, pay.amount, { accessUntil });
  }
}
