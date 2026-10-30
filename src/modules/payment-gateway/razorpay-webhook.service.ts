import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { createHmac, timingSafeEqual } from 'crypto';
import { UniqueConstraintError } from 'sequelize';
import { AppConfig } from '../../config/configuration';
import {
  PaymentWebhookEvent,
  WebhookEventStatus,
} from './models/payment-webhook-event.model';
import { User } from '../users/models/user.model';
import { Payment } from './models/payment.model';
import { PaymentsService } from './payments.service';

const PROVIDER = 'razorpay';

interface RazorpayWebhookBody {
  event?: string;
  payload?: Record<
    string,
    | {
        entity?: {
          id?: string;
          order_id?: string;
          payment_id?: string;
          amount?: number;
          contact?: string;
        };
      }
    | undefined
  >;
}

@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @InjectModel(PaymentWebhookEvent)
    private readonly eventModel: typeof PaymentWebhookEvent,
    @InjectModel(Payment) private readonly paymentModel: typeof Payment,
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly payments: PaymentsService,
  ) {}

  /** HMAC-SHA256 of the *raw* request body with the webhook secret, hex. */
  verifySignature(rawBody: Buffer, signature: string | undefined): void {
    const { webhookSecret } = this.configService.getOrThrow('razorpay', {
      infer: true,
    });
    if (!webhookSecret) {
      // Never accept unsigned traffic because of a missing config value.
      this.logger.error('RAZORPAY_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Webhook not configured');
    }
    if (!signature || !rawBody) {
      throw new UnauthorizedException('Missing signature');
    }
    const expected = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid signature');
    }
  }

  /**
   * Verifies, records and dispatches a delivery. Always resolves quickly so
   * Razorpay (which expects a 2xx within 5s) does not retry needlessly.
   */
  async handle(
    rawBody: Buffer,
    signature: string | undefined,
    eventId: string | undefined,
  ): Promise<{ duplicate: boolean }> {
    this.verifySignature(rawBody, signature);

    let body: RazorpayWebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }
    if (!body.event) throw new BadRequestException('Missing event');
    if (!eventId) throw new BadRequestException('Missing x-razorpay-event-id');

    // payload has one key per entity ("payment", "subscription", "order", ...)
    const entityType = Object.keys(body.payload ?? {})[0] ?? null;
    const entityId =
      (entityType && body.payload?.[entityType]?.entity?.id) || null;

    let row: PaymentWebhookEvent;
    try {
      row = await this.eventModel.create({
        provider: PROVIDER,
        eventId,
        eventType: body.event,
        entityType,
        entityId,
        payload: body as Record<string, unknown>,
      });
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) throw err;
      const existing = await this.eventModel.findOne({
        where: { provider: PROVIDER, eventId },
      });
      // A retry of an event that already succeeded is dropped; one that
      // failed (or never finished) is processed again - handlers are idempotent.
      if (!existing || existing.status === WebhookEventStatus.PROCESSED) {
        this.logger.log(`Duplicate razorpay event ${eventId} ignored`);
        return { duplicate: true };
      }
      row = existing;
    }

    try {
      await this.dispatch(body.event, body);
      await row.update({
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      });
    } catch (err) {
      this.logger.error(`Handling ${body.event} (${eventId}) failed`, err);
      await row.update({
        status: WebhookEventStatus.FAILED,
        error: err instanceof Error ? err.message : String(err),
      });
      // Not acked: a 5xx makes Razorpay redeliver (for up to 24h), so a paid
      // user is not left unupgraded by a transient error.
      throw err;
    }
    return { duplicate: false };
  }

  /**
   * Stores the payer's mobile number (Razorpay `contact`) on the user who
   * started the order. Best effort: a missing contact or a failed write must
   * never block granting the plan the user paid for.
   */
  private async saveMobileNumber(razorpayOrderId: string, contact?: string) {
    const mobileNumber = contact?.trim();
    if (!mobileNumber) return;
    try {
      const payment = await this.paymentModel.findOne({
        where: { razorpayOrderId },
        attributes: ['userId'],
      });
      if (!payment) return;
      await this.userModel.update(
        { mobileNumber: mobileNumber.slice(0, 20) },
        { where: { userId: payment.userId } },
      );
    } catch (err) {
      this.logger.error(
        `Could not save mobile number for order ${razorpayOrderId}`,
        err,
      );
    }
  }

  /**
   * Webhook safety net for the verify endpoint: if the user paid but closed
   * the tab before /verify ran, these events still grant the plan.
   */
  private async dispatch(event: string, body: RazorpayWebhookBody) {
    const payment = body.payload?.payment?.entity;
    switch (event) {
      case 'payment.captured':
      case 'order.paid':
        if (payment?.id && payment.order_id) {
          // Saved first, so the number is kept even if fulfilment fails.
          await this.saveMobileNumber(payment.order_id, payment.contact);
          await this.payments.fulfill(
            payment.order_id,
            payment.id,
            payment.amount,
          );
        }
        break;
      case 'refund.processed': {
        const refund = body.payload?.refund?.entity;
        if (refund?.payment_id) {
          await this.payments.handleRefund(
            refund.payment_id,
            refund.amount ?? 0,
          );
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled razorpay event ${event}`);
    }
  }
}
