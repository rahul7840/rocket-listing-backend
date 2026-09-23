import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { MeeshoPaymentDetail } from './meesho-payment-detail.model';

/**
 * A single Meesho payout ("Past Payments" row) synced from the seller panel.
 * Lives in the `config` schema; unique per (userId, paymentDate).
 * DECIMAL columns come back from pg as strings - kept that way to avoid
 * float drift on money.
 */
@Table({ tableName: 'meesho_payments', schema: 'config', timestamps: true })
export class MeeshoPayment extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  meeshoPaymentId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  paymentDate: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  neftId: string | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  orderAmount: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  platformRecovery: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  adsCost: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  programCost: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  platformCompensation: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  referral: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  programBenefits: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  netAmount: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  syncedAt: Date;

  /** Set once this payout's per-order details were synced (even if it had none); null = still pending. */
  @Column({ type: DataType.DATE, allowNull: true })
  detailsSyncedAt: Date | null;

  @HasMany(() => MeeshoPaymentDetail)
  details: MeeshoPaymentDetail[];
}
