import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Template } from './template.model';

/**
 * Holds the heavy per-template payload (recorded actions + metadata),
 * split out of `templates` so listing/searching templates doesn't have to
 * load large JSONB blobs. 1:1 with Template via `templateId`.
 */
@Table({ tableName: 'template_data', timestamps: true })
export class TemplateData extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  templateDataId: string;

  @ForeignKey(() => Template)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  templateId: string;

  @BelongsTo(() => Template)
  template: Template;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  actions: object[];

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  metadata: object;
}
