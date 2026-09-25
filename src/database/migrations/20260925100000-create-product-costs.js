'use strict';

const SCHEMA = 'config';
const PRODUCT_COSTS = { tableName: 'product_costs', schema: SCHEMA };

const money = (Sequelize) => ({
  type: Sequelize.DECIMAL(10, 2),
  allowNull: false,
  defaultValue: 0,
});

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        PRODUCT_COSTS,
        {
          productCostId: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          userId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: { tableName: 'users', schema: 'public' },
              key: 'userId',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          sku: { type: Sequelize.STRING(255), allowNull: false },
          productCost: money(Sequelize),
          packagingCost: money(Sequelize),
          otherCost: money(Sequelize),
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

      await queryInterface.addIndex(PRODUCT_COSTS, ['userId', 'sku'], {
        unique: true,
        name: 'product_costs_user_sku_unique',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable(PRODUCT_COSTS);
  },
};
