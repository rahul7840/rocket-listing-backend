import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

/** Razorpay's own subscription states (see razorpay.com/docs/payments/subscriptions/states). */
export enum AutopayStatus {
  CREATED = 'created',
  AUTHENTICATED = 'authenticated',
  ACTIVE = 'active',
  PENDING = 'pending',
  HALTED = 'halted',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

/** States in which the user still has autopay set up (or being set up). */
export const LIVE_AUTOPAY_STATUSES: AutopayStatus[] = [
  AutopayStatus.CREATED,
  AutopayStatus.AUTHENTICATED,
  AutopayStatus.ACTIVE,
  AutopayStatus.PENDING,
  AutopayStatus.PAUSED,
];

/** One row per Razorpay subscription (autopay) a user set up after a one-time purchase. */
@Table({ tableName: 'autopay_subscriptions', timestamps: true })
export class AutopaySubscription extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  autopayId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @Column({ type: DataType.STRING(32), allowNull: false })
  planCode: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  interval: string;

  @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
  razorpaySubscriptionId: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  razorpayPlanId: string;

  @Column({
    type: DataType.STRING(24),
    allowNull: false,
    defaultValue: AutopayStatus.CREATED,
  })
  status: AutopayStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  startAt: Date;

  @Column({ type: DataType.INTEGER, allowNull: false })
  totalCount: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  paidCount: number;

  @Column({ type: DataType.DATE, allowNull: true })
  lastChargedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  cancelRequestedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  cancelledAt: Date | null;
}
