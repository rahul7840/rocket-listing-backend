import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasOne,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { TemplateData } from './template-data.model';

export enum TemplateSource {
  MANUAL = 'manual',
  MEESHO = 'meesho',
}

@Table({ tableName: 'templates', timestamps: true })
export class Template extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  templateId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @Column({ type: DataType.STRING, allowNull: false })
  clientId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @Column({ type: DataType.STRING, allowNull: false })
  domain: string;

  @Column({ type: DataType.STRING, allowNull: true })
  startUrl: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  startTitle: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(TemplateSource)),
    allowNull: false,
    defaultValue: TemplateSource.MANUAL,
  })
  source: TemplateSource;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  playCount: number;

  @Column({ type: DataType.STRING, allowNull: true })
  ipAddress: string | null;

  /** The large actions/metadata payload lives in its own table - see TemplateData. */
  @HasOne(() => TemplateData, { foreignKey: 'templateId', as: 'data' })
  data: TemplateData;
}
