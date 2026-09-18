import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { Recording } from '../../recordings/models/recording.model';
import { Template } from '../../templates/models/template.model';

@Table({ tableName: 'users', timestamps: true })
export class User extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  userId: string;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  googleId: string;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  email: string;

  @Column({ type: DataType.STRING, allowNull: true })
  displayName: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  photoUrl: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  lastLoginAt: Date | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive: boolean;

  @HasMany(() => Recording)
  recordings: Recording[];

  @HasMany(() => Template)
  templates: Template[];
}
