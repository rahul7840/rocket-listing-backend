import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

export type MeeshoSyncLogKind = 'payments' | 'details';
export type MeeshoSyncLogStatus = 'success' | 'error';

/**
 * Audit trail of every /meesho-payments/sync and /meesho-payments/details/sync
 * call - not itself a duplicate guard (the unique indexes on MeeshoPayment and
 * MeeshoPaymentDetail already make duplicate rows impossible), but a record of
 * when each user's data was last touched and what each run actually did.
 */
@Table({ tableName: 'meesho_payment_sync_logs', schema: 'config', timestamps: true })
export class MeeshoPaymentSyncLog extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  syncLogId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @Column({ type: DataType.STRING(20), allowNull: false })
  kind: MeeshoSyncLogKind;

  /** Only set for kind = 'details' - which payout this run covered. */
  @Column({ type: DataType.DATEONLY, allowNull: true })
  paymentDate: string | null;

  @Column({ type: DataType.STRING(20), allowNull: false })
  status: MeeshoSyncLogStatus;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  received: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  inserted: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  skipped: number;

  @Column({ type: DataType.STRING(500), allowNull: true })
  errorMessage: string | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  syncedAt: Date;
}
