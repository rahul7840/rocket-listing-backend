import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * A back-office operator account, entirely separate from the `users` table
 * (which is end-user/extension accounts authenticated via Google). Admin
 * sessions are signed with their own secret (see AdminAuthModule) so an
 * admin JWT and a user JWT are never interchangeable.
 */
@Table({ tableName: 'admin_users', timestamps: true })
export class AdminUser extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  adminUserId: string;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  email: string;

  @Column({ type: DataType.STRING, allowNull: false })
  passwordHash: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  lastLoginAt: Date | null;
}
