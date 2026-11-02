import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

export enum SessionBookingStatus {
  /** Order created, not paid yet. Holds the slot for SLOT_HOLD_MINUTES. */
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  /** The Razorpay order could not be created, so the hold is released. */
  FAILED = 'failed',
}

/**
 * One row per attempt to book the one-to-one session. Visitors book without signing in, so there is
 * no user id: the row carries the name and phone the team needs to reach them.
 * `sessionDate` and `slot` are both null when the buyer chose to pick the date after paying.
 */
@Table({ tableName: 'learning_session_bookings', timestamps: true })
export class LearningSessionBooking extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  bookingId: string;

  /** The signed-in user who booked, so it shows on their dashboard. Null when booked without signing in. */
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  userId: string | null;

  @Column({ type: DataType.STRING(80), allowNull: false })
  name: string;

  /** Ten digits, no country code. */
  @Column({ type: DataType.STRING(15), allowNull: false })
  phone: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  goal: string | null;

  /** Day of the session (India date), or null to choose later. */
  @Column({ type: DataType.DATEONLY, allowNull: true })
  sessionDate: string | null;

  /** Start time such as "7:00 PM", or null to choose later. */
  @Column({ type: DataType.STRING(16), allowNull: true })
  slot: string | null;

  /** Smallest currency unit (paise). */
  @Column({ type: DataType.INTEGER, allowNull: false })
  amount: number;

  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'INR' })
  currency: string;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: SessionBookingStatus.PENDING,
  })
  status: SessionBookingStatus;

  @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
  razorpayOrderId: string;

  @Column({ type: DataType.STRING(64), allowNull: true })
  razorpayPaymentId: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  paidAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  refundedAt: Date | null;

  /** Set when the chosen slot was taken by someone else first; the team must agree a new time. */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  needsNewSlot: boolean;
}
