'use strict';

const SCHEMA = 'config';
const TABLE = { tableName: 'meesho_categories', schema: SCHEMA };

/**
 * The whole Meesho category tree in one self-referencing table:
 *   1 super-category -> 2 category -> 3 sub-category -> 4 sub-sub-category
 *
 * Meesho reuses a numeric id across levels (e.g. 131 is both a category and a
 * super-category), so `externalId` is only unique per `level`. `parentId` is
 * our own UUID, so walking up the tree never depends on Meesho's ids.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        TABLE,
        {
          meeshoCategoryId: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          externalId: { type: Sequelize.INTEGER, allowNull: false },
          level: { type: Sequelize.SMALLINT, allowNull: false },
          type: { type: Sequelize.STRING(20), allowNull: false },
          name: { type: Sequelize.STRING(255), allowNull: false },
          parentId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: TABLE, key: 'meeshoCategoryId' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          externalParentId: { type: Sequelize.INTEGER, allowNull: true },
          minProducts: { type: Sequelize.INTEGER, allowNull: true },
          maxProducts: { type: Sequelize.INTEGER, allowNull: true },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('now'),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('now'),
          },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "${SCHEMA}"."meesho_categories"
           ADD CONSTRAINT meesho_categories_level_type_check CHECK (
             (level = 1 AND type = 'super-category' AND "parentId" IS NULL) OR
             (level = 2 AND type = 'category' AND "parentId" IS NOT NULL) OR
             (level = 3 AND type = 'sub-category' AND "parentId" IS NOT NULL) OR
             (level = 4 AND type = 'sub-sub-category' AND "parentId" IS NOT NULL)
           )`,
        { transaction },
      );

      await queryInterface.addIndex(TABLE, ['level', 'externalId'], {
        unique: true,
        name: 'meesho_categories_level_external_unique',
        transaction,
      });
      await queryInterface.addIndex(TABLE, ['parentId'], {
        name: 'meesho_categories_parent_idx',
        transaction,
      });
      await queryInterface.sequelize.query(
        `CREATE INDEX meesho_categories_name_lower_idx
           ON "${SCHEMA}"."meesho_categories" (level, lower(name))`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE);
  },
};
