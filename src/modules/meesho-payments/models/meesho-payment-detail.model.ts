import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { MeeshoPayment } from './meesho-payment.model';

/**
 * One order line of a Meesho payout (a row of the panel's "Order Details"
 * tab), linked to its MeeshoPayment. Unique per (meeshoPaymentId, orderNo,
 * subOrderNo); subOrderNo is '' when the panel doesn't show one.
 */
@Table({
  tableName: 'meesho_payment_details',
  schema: 'config',
  timestamps: true,
})
export class MeeshoPaymentDetail extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  meeshoPaymentDetailId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @ForeignKey(() => MeeshoPayment)
  @Column({ type: DataType.UUID, allowNull: false })
  meeshoPaymentId: string;

  @BelongsTo(() => MeeshoPayment)
  payment: MeeshoPayment;

  @Column({ type: DataType.STRING(100), allowNull: false })
  orderNo: string;

  @Column({ type: DataType.STRING(120), allowNull: false, defaultValue: '' })
  subOrderNo: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  sku: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  orderStatus: string | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  subOrderContribution: string;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  orderAmount: string;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  claimsCompensations: string;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  recoveriesCharges: string;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  netOrderAmount: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  syncedAt: Date;
}
