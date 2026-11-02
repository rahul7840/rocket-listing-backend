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
import { Op, UniqueConstraintError } from 'sequelize';
import { AppConfig } from '../../config/configuration';
import {
  BOOKING_WINDOW_DAYS,
  SESSION_CURRENCY,
  SESSION_NAME,
  SESSION_PRICE_PAISE,
  SLOT_HOLD_MINUTES,
} from './learning.constants';
import {
  CreateSessionBookingDto,
  VerifySessionPaymentDto,
} from './dto/session-booking.dto';
import {
  LearningSessionBooking,
  SessionBookingStatus,
} from './models/learning-session-booking.model';

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India as YYYY-MM-DD. */
const istDate = (offsetDays = 0, now = Date.now()) =>
  new Date(now + IST_OFFSET_MS + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Ten digits without a country code. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** What a buyer is told about a booking. No other buyer's data is ever returned here. */
export interface BookingSummary {
  bookingId: string;
  status: SessionBookingStatus;
  date: string | null;
  slot: string | null;
  chooseLater: boolean;
  needsNewSlot: boolean;
}

/**
 * Learning: the one-to-one Meesho seller session. A visitor picks a day and start time (or chooses
 * later), a Razorpay order for the fixed price is created, and the row becomes `paid` when Razorpay
 * confirms it, through the verify call or the webhook, whichever comes first. Both paths run the same
 * conditional update, so the result is the same however many times Razorpay repeats itself.
 */
@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @InjectModel(LearningSessionBooking)
    private readonly bookingModel: typeof LearningSessionBooking,
  ) {}

  private get razorpay() {
    return this.configService.getOrThrow('razorpay', { infer: true });
  }

  private summary(b: LearningSessionBooking): BookingSummary {
    return {
      bookingId: b.bookingId,
      status: b.status,
      date: b.sessionDate,
      slot: b.slot,
      chooseLater: !b.sessionDate && !b.slot,
      needsNewSlot: b.needsNewSlot,
    };
  }

  /** Slots nobody else can pick right now: paid, or held by a payment started a moment ago. */
  private takenWhere(from: string, to: string) {
    const holdCutoff = new Date(Date.now() - SLOT_HOLD_MINUTES * 60 * 1000);
    return {
      sessionDate: { [Op.between]: [from, to] },
      [Op.or]: [
        { status: SessionBookingStatus.PAID },
        {
          status: SessionBookingStatus.PENDING,
          createdAt: { [Op.gte]: holdCutoff },
        },
      ],
    };
  }

  /** Taken day and time pairs, for the booking calendar. */
  async availability() {
    const rows = await this.bookingModel.findAll({
      where: this.takenWhere(istDate(1), istDate(BOOKING_WINDOW_DAYS + 1)),
      attributes: ['sessionDate', 'slot'],
      raw: true,
    });
    return {
      taken: rows.map((r) => ({ date: r.sessionDate, slot: r.slot })),
    };
  }

  /**
   * Step 1: reserve the slot and create the Razorpay order. The row is written first, under a lock
   * on that slot, so two people cannot start paying for the same one.
   */
  async book(dto: CreateSessionBookingDto, userId?: string) {
    const { keyId, keySecret } = this.razorpay;
    if (!keyId || !keySecret) {
      this.logger.error(
        'RAZORPAY_API_KEY / RAZORPAY_KEY_SECRET not configured',
      );
      throw new ServiceUnavailableException('Payments are not configured');
    }

    if (!!dto.date !== !!dto.slot) {
      throw new BadRequestException(
        'Choose both a day and a start time, or choose neither and pick later',
      );
    }
    if (dto.date) {
      const from = istDate(1);
      const to = istDate(BOOKING_WINDOW_DAYS);
      if (dto.date < from || dto.date > to) {
        throw new BadRequestException(
          'Pick a day from tomorrow, within the next 45 days',
        );
      }
      if (Number.isNaN(Date.parse(`${dto.date}T00:00:00Z`))) {
        throw new BadRequestException('That day is not valid');
      }
    }
    const phone = normalizePhone(dto.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new BadRequestException('Enter a valid 10-digit mobile number');
    }

    const bookingId = randomUUID();
    const sequelize = this.bookingModel.sequelize!;
    await sequelize.transaction(async (transaction) => {
      if (dto.date && dto.slot) {
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
          replacements: { key: `learning-slot:${dto.date}:${dto.slot}` },
          transaction,
        });
        const taken = await this.bookingModel.findOne({
          where: {
            ...this.takenWhere(dto.date, dto.date),
            slot: dto.slot,
            // The same person trying again after closing the payment window is not a clash.
            [Op.not]: { status: SessionBookingStatus.PENDING, phone },
          },
          transaction,
        });
        if (taken) {
          throw new ConflictException(
            'That time was just taken. Please pick another start time.',
          );
        }
      }
      await this.bookingModel.create(
        {
          bookingId,
          userId: userId ?? null,
          name: dto.name,
          phone,
          goal: dto.goal || null,
          sessionDate: dto.date ?? null,
          slot: dto.slot ?? null,
          amount: SESSION_PRICE_PAISE,
          currency: SESSION_CURRENCY,
          // Replaced as soon as Razorpay answers; unique so it cannot clash.
          razorpayOrderId: `pending_${bookingId}`,
        },
        { transaction },
      );
    });

    let orderId: string;
    try {
      const res = await fetch(`${RAZORPAY_API}/orders`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: SESSION_PRICE_PAISE,
          currency: SESSION_CURRENCY,
          // Razorpay caps receipt at 40 characters.
          receipt: bookingId.replace(/-/g, ''),
          notes: { type: 'learning_session', bookingId },
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      orderId = ((await res.json()) as { id: string }).id;
    } catch (err) {
      this.logger.error(`Razorpay order for session ${bookingId} failed`, err);
      await this.bookingModel.update(
        { status: SessionBookingStatus.FAILED },
        { where: { bookingId } },
      );
      throw new BadGatewayException('Could not start the payment');
    }
    await this.bookingModel.update(
      { razorpayOrderId: orderId },
      { where: { bookingId } },
    );

    return {
      bookingId,
      keyId,
      orderId,
      amount: SESSION_PRICE_PAISE,
      currency: SESSION_CURRENCY,
      name: SESSION_NAME,
    };
  }

  /** Step 2: the browser reports the Razorpay result. The signature proves Razorpay says it is paid. */
  async verify(dto: VerifySessionPaymentDto): Promise<BookingSummary> {
    const booking = await this.bookingModel.findOne({
      where: { razorpayOrderId: dto.razorpay_order_id },
    });
    if (!booking) throw new NotFoundException('Booking not found');

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

    return this.summary(await this.markPaid(booking, dto.razorpay_payment_id));
  }

  /**
   * Webhook safety net: if the buyer paid but closed the tab before verify ran, the booking is still
   * marked paid. Returns false when the order is not a session booking, so other handlers can take it.
   */
  async fulfillByOrder(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    paidAmount?: number,
  ): Promise<boolean> {
    const booking = await this.bookingModel.findOne({
      where: { razorpayOrderId },
    });
    if (!booking) return false;
    if (paidAmount !== undefined && paidAmount !== booking.amount) {
      throw new Error(
        `Amount mismatch for ${razorpayOrderId}: paid ${paidAmount}, expected ${booking.amount}`,
      );
    }
    await this.markPaid(booking, razorpayPaymentId);
    return true;
  }

  /** Marks a full refund. Returns false when the payment is not a session booking. */
  async handleRefund(
    razorpayPaymentId: string,
    refundedAmount: number,
  ): Promise<boolean> {
    const booking = await this.bookingModel.findOne({
      where: { razorpayPaymentId },
    });
    if (!booking) return false;
    if (refundedAmount >= booking.amount) {
      await this.bookingModel.update(
        { status: SessionBookingStatus.REFUNDED, refundedAt: new Date() },
        {
          where: {
            bookingId: booking.bookingId,
            status: { [Op.ne]: SessionBookingStatus.REFUNDED },
          },
        },
      );
    }
    return true;
  }

  /**
   * pending -> paid, once. The WHERE makes it safe to call from verify and from webhooks in any
   * order, and as often as Razorpay repeats a delivery. If the slot was paid for by someone else in
   * the meantime (the unique index says so), the money is kept and the booking is flagged so the
   * team agrees a new time, instead of the buyer paying for nothing.
   */
  private async markPaid(
    booking: LearningSessionBooking,
    razorpayPaymentId: string,
  ): Promise<LearningSessionBooking> {
    if (booking.status !== SessionBookingStatus.PENDING) return booking;
    const paid = {
      status: SessionBookingStatus.PAID,
      razorpayPaymentId,
      paidAt: new Date(),
    };
    const where = {
      bookingId: booking.bookingId,
      status: SessionBookingStatus.PENDING,
    };
    try {
      await this.bookingModel.update(paid, { where });
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) throw err;
      this.logger.warn(
        `Slot ${booking.sessionDate} ${booking.slot} was already paid for; ${booking.bookingId} needs a new time`,
      );
      await this.bookingModel.update(
        { ...paid, sessionDate: null, slot: null, needsNewSlot: true },
        { where },
      );
    }
    return (await this.bookingModel.findByPk(booking.bookingId)) ?? booking;
  }

  /** A user's own paid or refunded bookings, newest first, for their dashboard. */
  async listForUser(userId: string) {
    const rows = await this.bookingModel.findAll({
      where: {
        userId,
        status: {
          [Op.in]: [SessionBookingStatus.PAID, SessionBookingStatus.REFUNDED],
        },
      },
      order: [['createdAt', 'DESC']],
    });
    return rows.map((b) => ({
      ...this.summary(b),
      name: b.name,
      amount: b.amount,
      currency: b.currency,
      paidAt: b.paidAt,
      createdAt: b.createdAt as Date,
    }));
  }
}
