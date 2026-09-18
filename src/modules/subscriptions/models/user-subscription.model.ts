import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { Plan } from '../../plans/models/plan.model';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PENDING = 'pending',
}

/** Who/what caused this subscription row to exist. */
export enum SubscriptionSource {
  ADMIN = 'admin',
  SYSTEM = 'system',
  PAYMENT = 'payment',
}

/**
 * One row per subscription "stint" a user has been on. Rows are never
 * overwritten - changing plans closes the current active row (status moves
 * off ACTIVE, currentPeriodEnd is stamped) and inserts a new one, so this
 * table is the full plan history for a user. Exactly one row per user may
 * have status = ACTIVE at a time (enforced by a partial unique index in the
 * migration - see user_subscriptions_user_id_active_unique).
 */
@Table({ tableName: 'user_subscriptions', timestamps: true })
export class UserSubscription extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  userSubscriptionId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Plan)
  @Column({ type: DataType.UUID, allowNull: false })
  planId: string;

  @BelongsTo(() => Plan)
  plan: Plan;

  @Column({
    type: DataType.ENUM(...Object.values(SubscriptionStatus)),
    allowNull: false,
    defaultValue: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  startedAt: Date;

  /** Nullable: not every subscription (e.g. an open-ended Free assignment) has a billing period. */
  @Column({ type: DataType.DATE, allowNull: true })
  currentPeriodStart: Date | null;

  /** Nullable while active/open-ended; stamped with the close time once the row stops being current. */
  @Column({ type: DataType.DATE, allowNull: true })
  currentPeriodEnd: Date | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  cancelAtPeriodEnd: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(SubscriptionSource)),
    allowNull: false,
  })
  source: SubscriptionSource;
}
