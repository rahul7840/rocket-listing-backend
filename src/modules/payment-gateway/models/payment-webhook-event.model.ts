import { Column, DataType, Model, Table } from 'sequelize-typescript';

export enum WebhookEventStatus {
  RECEIVED = 'received',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

/**
 * Append-only log of every verified webhook delivery from a payment provider.
 * (provider, eventId) is unique so a retried delivery is recognised and not
 * handled twice.
 */
@Table({ tableName: 'payment_webhook_events', timestamps: true })
export class PaymentWebhookEvent extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  paymentWebhookEventId: string;

  @Column({ type: DataType.STRING(32), allowNull: false })
  provider: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  eventId: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  eventType: string;

  @Column({ type: DataType.STRING(64), allowNull: true })
  entityType: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true })
  entityId: string | null;

  @Column({ type: DataType.JSONB, allowNull: false })
  payload: Record<string, unknown>;

  @Column({
    type: DataType.ENUM(...Object.values(WebhookEventStatus)),
    allowNull: false,
    defaultValue: WebhookEventStatus.RECEIVED,
  })
  status: WebhookEventStatus;

  @Column({ type: DataType.TEXT, allowNull: true })
  error: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  processedAt: Date | null;
}
