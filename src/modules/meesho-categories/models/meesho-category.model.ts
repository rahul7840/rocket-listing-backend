import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * One node of Meesho's category tree (config.meesho_categories), loaded by
 * src/database/scripts/import-meesho-categories.js. All four levels share the
 * table: 1 super-category > 2 category > 3 sub-category > 4 sub-sub-category.
 * Meesho reuses ids across levels, so `externalId` is only unique per `level`.
 */
@Table({
  tableName: 'meesho_categories',
  schema: 'config',
  timestamps: true,
})
export class MeeshoCategory extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  meeshoCategoryId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  externalId: number;

  @Column({ type: DataType.SMALLINT, allowNull: false })
  level: number;

  @Column({ type: DataType.STRING(20), allowNull: false })
  type: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name: string;

  @Column({ type: DataType.UUID, allowNull: true })
  parentId: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  externalParentId: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  minProducts: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  maxProducts: number | null;
}
