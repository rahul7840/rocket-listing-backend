import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

/**
 * Seller-entered cost per SKU (product + packaging + other), used to turn
 * Meesho's net payout into an estimated profit. One row per (userId, sku).
 */
@Table({
  tableName: 'product_costs',
  schema: 'config',
  timestamps: true,
})
export class ProductCost extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  productCostId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  sku: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 })
  productCost: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 })
  packagingCost: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 })
  otherCost: string;
}
