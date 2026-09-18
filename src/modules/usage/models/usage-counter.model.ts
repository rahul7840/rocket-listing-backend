import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

export enum UsagePeriodType {
  DAILY = 'daily',
  MONTHLY = 'monthly',
  LIFETIME = 'lifetime',
}

/**
 * One row per (user, feature, period) - a generic counter that works for any
 * future feature key without a dedicated table. `periodKey` is what makes a
 * new period "just happen" with no cron job: it's derived from the current
 * date (e.g. "2026-09-18" for daily, "2026-09" for monthly, a fixed constant
 * for lifetime), so incrementing on a new day naturally targets a fresh row.
 */
@Table({ tableName: 'usage_counters', timestamps: true })
export class UsageCounter extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  usageCounterId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  /** Stable identifier for the feature being counted, e.g. "listing.create". */
  @Column({ type: DataType.STRING, allowNull: false })
  featureKey: string;

  @Column({
    type: DataType.ENUM(...Object.values(UsagePeriodType)),
    allowNull: false,
  })
  periodType: UsagePeriodType;

  /** e.g. "2026-09-18" (daily), "2026-09" (monthly), a fixed constant (lifetime). */
  @Column({ type: DataType.STRING, allowNull: false })
  periodKey: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  usageCount: number;
}
