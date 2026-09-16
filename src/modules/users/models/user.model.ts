import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { Recording } from '../../recordings/models/recording.model';

@Table({ tableName: 'users', timestamps: true })
export class User extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id: string;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  firebaseUid: string;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  email: string;

  @Column({ type: DataType.STRING, allowNull: true })
  displayName: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  photoUrl: string | null;

  @HasMany(() => Recording)
  recordings: Recording[];
}
