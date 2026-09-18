import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { PlanFeature } from './plan-feature.model';

/** Stable plan codes. New plans can still be added without extending this enum, since the column is a plain unique string. */
export enum PlanCode {
  FREE = 'FREE',
  PRO = 'PRO',
  MAX = 'MAX',
  ROCKET = 'ROCKET',
}

@Table({ tableName: 'plans', timestamps: true })
export class Plan extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  planId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  code: string;

  @Column({ type: DataType.STRING, allowNull: true })
  description: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive: boolean;

  @HasMany(() => PlanFeature)
  features: PlanFeature[];
}
