import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Plan } from './plan.model';

/**
 * How a feature's value is shaped:
 * - BOOLEAN: an on/off capability (e.g. marketplace.sync), read from `boolValue`.
 * - LIMIT: a numeric cap (e.g. template.create), read from `limitValue`/`isUnlimited`.
 */
export enum PlanFeatureValueType {
  BOOLEAN = 'boolean',
  LIMIT = 'limit',
}

/**
 * The window a LIMIT resets on. Null means the limit is a standing cap that
 * doesn't reset on a schedule (e.g. "max 5 saved templates").
 */
export enum PlanFeaturePeriod {
  DAILY = 'daily',
  MONTHLY = 'monthly',
}

@Table({
  tableName: 'plan_features',
  timestamps: true,
})
export class PlanFeature extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  planFeatureId: string;

  @ForeignKey(() => Plan)
  @Column({ type: DataType.UUID, allowNull: false })
  planId: string;

  @BelongsTo(() => Plan)
  plan: Plan;

  /** Stable identifier for the feature, e.g. "template.create", "marketplace.sync". */
  @Column({ type: DataType.STRING, allowNull: false })
  featureKey: string;

  @Column({
    type: DataType.ENUM(...Object.values(PlanFeatureValueType)),
    allowNull: false,
  })
  valueType: PlanFeatureValueType;

  /** Used when valueType = BOOLEAN. */
  @Column({ type: DataType.BOOLEAN, allowNull: true })
  boolValue: boolean | null;

  /** Used when valueType = LIMIT and the feature is not unlimited. */
  @Column({ type: DataType.INTEGER, allowNull: true })
  limitValue: number | null;

  /** Used when valueType = LIMIT; true overrides limitValue to mean "no cap". */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isUnlimited: boolean;

  /** Used when valueType = LIMIT; null means the limit doesn't reset on a schedule. */
  @Column({
    type: DataType.ENUM(...Object.values(PlanFeaturePeriod)),
    allowNull: true,
  })
  period: PlanFeaturePeriod | null;

  /** Room for future per-feature config without new columns/migrations. */
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  metadata: object;
}
