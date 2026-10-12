import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Transaction } from 'sequelize';
import { AppConfig } from '../../config/configuration';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionSource } from '../subscriptions/models/user-subscription.model';
import { CreateOrderDto, VerifyPaymentDto } from './dto/payment.dto';
import {
  BillingInterval,
  Payment,
  PaymentStatus,
} from './models/payment.model';
import { CURRENCY, PLAN_PRICING } from './plan-pricing';

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @InjectModel(Payment) private readonly paymentModel: typeof Payment,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  private get razorpay() {
    return this.configService.getOrThrow('razorpay', { infer: true });
  }

  /** Public price list the website renders its checkout from. */
  getPricing() {
    return Object.entries(PLAN_PRICING).map(([planCode, intervals]) => ({
      planCode,
      currency: CURRENCY,
      prices: Object.entries(intervals).map(([interval, option]) => ({
        interval,
        amount: option.amount,
        days: option.days,
      })),
    }));
  }

  /** Step 1 of checkout: create a Razorpay order for a plan the server prices. */
  async createOrder(userId: string, dto: CreateOrderDto) {
    const { keyId, keySecret } = this.razorpay;
    if (!keyId || !keySecret) {
      this.logger.error('RAZORPAY_API_KEY / RAZORPAY_KEY_SECRET not configured');
      throw new ServiceUnavailableException('Payments are not configured');
    }

    const price = PLAN_PRICING[dto.planCode]?.[dto.interval];
    if (!price) {
      throw new BadRequestException(
        `${dto.planCode} (${dto.interval}) is not available for purchase`,
      );
    }

    const paymentId = randomUUID();
    const res = await fetch(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: price.amount,
        currency: CURRENCY,
        // Razorpay caps receipt at 40 chars.
        receipt: paymentId.replace(/-/g, ''),
        notes: { userId, planCode: dto.planCode, interval: dto.interval },
      }),
    });
    if (!res.ok) {
      this.logger.error(`Razorpay order failed: ${res.status} ${await res.text()}`);
      throw new BadGatewayException('Could not start the payment');
    }
    const order = (await res.json()) as { id: string };

    await this.paymentModel.create({
      paymentId,
      userId,
      planCode: dto.planCode,
      interval: dto.interval,
      amount: price.amount,
      currency: CURRENCY,
      razorpayOrderId: order.id,
    });

    return {
      keyId,
      orderId: order.id,
      amount: price.amount,
      currency: CURRENCY,
      planCode: dto.planCode,
      interval: dto.interval,
    };
  }

  /**
   * Step 2 of checkout: the browser reports the Razorpay result. The
   * signature proves Razorpay (not the client) says this order was paid, and
   * the plan is granted immediately. The webhook does the same later as a
   * safety net - fulfilment is idempotent.
   */
  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const payment = await this.paymentModel.findOne({
      where: { razorpayOrderId: dto.razorpay_order_id, userId },
    });
    if (!payment) throw new NotFoundException('Order not found');

    // An empty key would make the HMAC trivially forgeable.
    if (!this.razorpay.keySecret) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const expected = createHmac('sha256', this.razorpay.keySecret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(dto.razorpay_signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid payment signature');
    }

    const fulfilled = await this.fulfill(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
    );
    return {
      planCode: fulfilled!.planCode,
      currentPeriodStart: fulfilled!.periodStart,
      currentPeriodEnd: fulfilled!.periodEnd,
    };
  }

  /**
   * Grants the plan for a paid order, exactly once. Safe to call from the
   * verify endpoint and from webhooks in any order or repeatedly: the payment
   * row is locked and fulfilledAt short-circuits repeats.
   */
  async fulfill(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    paidAmount?: number,
  ): Promise<Payment | null> {
    return this.paymentModel.sequelize!.transaction(
      async (transaction: Transaction) => {
        const payment = await this.paymentModel.findOne({
          where: { razorpayOrderId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!payment) {
          this.logger.warn(`Paid order ${razorpayOrderId} has no payment row`);
          return null;
        }
        if (payment.fulfilledAt) return payment;
        if (paidAmount !== undefined && paidAmount !== payment.amount) {
          throw new Error(
            `Amount mismatch for ${razorpayOrderId}: paid ${paidAmount}, expected ${payment.amount}`,
          );
        }

        const days = PLAN_PRICING[payment.planCode]?.[payment.interval]?.days;
        if (!days) throw new Error(`No pricing for ${payment.planCode}`);

        const now = new Date();
        const current = await this.subscriptionsService.getCurrentSubscription(
          payment.userId,
        );
        const renewing =
          current?.plan?.code === payment.planCode &&
          !!current.currentPeriodEnd &&
          current.currentPeriodEnd.getTime() > now.getTime();

        // Renewing the same plan stacks the new period onto the remaining
        // time; anything else (first purchase, upgrade, lapsed) starts now.
        const periodStart = renewing ? current!.currentPeriodEnd! : now;
        const periodEnd = new Date(periodStart.getTime() + days * DAY_MS);

        if (renewing) {
          await this.subscriptionsService.extendCurrentPeriod(
            payment.userId,
            periodEnd,
          );
        } else {
          await this.subscriptionsService.assignPlan(
            payment.userId,
            payment.planCode,
            SubscriptionSource.PAYMENT,
            { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
          );
        }

        return payment.update(
          {
            status: PaymentStatus.PAID,
            razorpayPaymentId,
            periodStart,
            periodEnd,
            paidAt: now,
            fulfilledAt: now,
          },
          { transaction },
        );
      },
    );
  }

  /**
   * Full refund: takes back exactly the time that payment bought. If other
   * paid time remains the user keeps it; if nothing is left they drop to Free.
   */
  async handleRefund(razorpayPaymentId: string, refundedAmount: number) {
    const payment = await this.paymentModel.findOne({
      where: { razorpayPaymentId },
    });
    if (!payment || payment.status === PaymentStatus.REFUNDED) return;
    if (refundedAmount < payment.amount) {
      this.logger.log(`Partial refund on ${razorpayPaymentId} - plan kept`);
      return;
    }

    await payment.update({
      status: PaymentStatus.REFUNDED,
      refundedAt: new Date(),
    });

    const current = await this.subscriptionsService.getCurrentSubscription(
      payment.userId,
    );
    if (current?.plan?.code !== payment.planCode || !current.currentPeriodEnd) {
      return;
    }
    const days = PLAN_PRICING[payment.planCode]?.[payment.interval]?.days ?? 0;
    const newEnd = new Date(current.currentPeriodEnd.getTime() - days * DAY_MS);
    if (newEnd.getTime() > Date.now()) {
      await this.subscriptionsService.extendCurrentPeriod(
        payment.userId,
        newEnd,
      );
    } else {
      await this.subscriptionsService.assignPlan(
        payment.userId,
        'FREE',
        SubscriptionSource.SYSTEM,
      );
    }
  }

  /** The user's purchase history, newest first. */
  listForUser(userId: string) {
    return this.paymentModel.findAll({
      // Abandoned checkouts (still 'created') are not purchases.
      where: { userId, status: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
      attributes: [
        'paymentId',
        'planCode',
        'interval',
        'amount',
        'currency',
        'status',
        'periodStart',
        'periodEnd',
        'paidAt',
        'createdAt',
      ],
      order: [['createdAt', 'DESC']],
    });
  }
}
