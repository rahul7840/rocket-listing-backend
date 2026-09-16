import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

export enum RecordingStatus {
  DRAFT = 'draft',
  READY = 'ready',
  ARCHIVED = 'archived',
}

@Table({ tableName: 'recordings', timestamps: true })
export class Recording extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @Column({ type: DataType.STRING, allowNull: true })
  platform: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  sourceUrl: string | null;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  actions: object[];

  @Column({
    type: DataType.ENUM(...Object.values(RecordingStatus)),
    allowNull: false,
    defaultValue: RecordingStatus.DRAFT,
  })
  status: RecordingStatus;
}
