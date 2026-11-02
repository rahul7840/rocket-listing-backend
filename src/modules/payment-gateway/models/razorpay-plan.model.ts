import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * The Razorpay plan made for one (planCode, interval, amount). Created the
 * first time someone sets up autopay and reused afterwards. A price change
 * adds a new row; an old plan is never edited.
 */
@Table({ tableName: 'razorpay_plans', timestamps: true })
export class RazorpayPlan extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  razorpayPlanRowId: string;

  @Column({ type: DataType.STRING(32), allowNull: false })
  planCode: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  interval: string;

  /** Smallest currency unit (paise). */
  @Column({ type: DataType.INTEGER, allowNull: false })
  amount: number;

  @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
  razorpayPlanId: string;
}
