import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

export enum BillingInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum PaymentStatus {
  CREATED = 'created',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

/** One row per Razorpay order a user started - the purchase ledger. */
@Table({ tableName: 'payments', timestamps: true })
export class Payment extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  paymentId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @Column({ type: DataType.STRING(32), allowNull: false })
  planCode: string;

  @Column({
    type: DataType.ENUM(...Object.values(BillingInterval)),
    allowNull: false,
  })
  interval: BillingInterval;

  /** Smallest currency unit (paise for INR). */
  @Column({ type: DataType.INTEGER, allowNull: false })
  amount: number;

  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'INR' })
  currency: string;

  @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
  razorpayOrderId: string;

  @Column({ type: DataType.STRING(64), allowNull: true })
  razorpayPaymentId: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(PaymentStatus)),
    allowNull: false,
    defaultValue: PaymentStatus.CREATED,
  })
  status: PaymentStatus;

  @Column({ type: DataType.DATE, allowNull: true })
  periodStart: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  periodEnd: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  paidAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  fulfilledAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  refundedAt: Date | null;
}
