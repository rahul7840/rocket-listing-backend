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

const PROVIDER = 'razorpay';

interface RazorpayWebhookBody {
  event?: string;
  payload?: Record<string, { entity?: { id?: string } } | undefined>;
}

@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @InjectModel(PaymentWebhookEvent)
    private readonly eventModel: typeof PaymentWebhookEvent,
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
      if (err instanceof UniqueConstraintError) {
        this.logger.log(`Duplicate razorpay event ${eventId} ignored`);
        return { duplicate: true };
      }
      throw err;
    }

    try {
      await this.dispatch(body.event);
      await row.update({
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      });
    } catch (err) {
      // Logged and stored, but still acked: the event is persisted and can be
      // replayed from payment_webhook_events instead of relying on retries.
      this.logger.error(`Handling ${body.event} (${eventId}) failed`, err);
      await row.update({
        status: WebhookEventStatus.FAILED,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { duplicate: false };
  }

  /**
   * Hook point for business logic (activate/extend/cancel subscriptions).
   * Add real handling per event once a plan <-> Razorpay plan mapping exists.
   */
  private async dispatch(event: string): Promise<void> {
    switch (event) {
      case 'payment.captured':
      case 'payment.failed':
      case 'order.paid':
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.cancelled':
      case 'subscription.completed':
      case 'subscription.halted':
        this.logger.log(`Received ${event}`);
        break;
      default:
        this.logger.debug(`Unhandled razorpay event ${event}`);
    }
  }
}
