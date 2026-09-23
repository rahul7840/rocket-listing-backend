'use strict';

const SCHEMA = 'config';
const PAYMENTS = { tableName: 'meesho_payments', schema: SCHEMA };
const DETAILS = { tableName: 'meesho_payment_details', schema: SCHEMA };

const money = (Sequelize) => ({
  type: Sequelize.DECIMAL(14, 2),
  allowNull: false,
  defaultValue: 0,
});

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Marks a payout whose per-order breakdown has been synced (even if it
      // turned out to have zero orders) - NULL means "still needs its details".
      await queryInterface.addColumn(
        PAYMENTS,
        'detailsSyncedAt',
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );

      await queryInterface.createTable(
        DETAILS,
        {
          meeshoPaymentDetailId: {
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
          meeshoPaymentId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: PAYMENTS, key: 'meeshoPaymentId' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          orderNo: { type: Sequelize.STRING(100), allowNull: false },
          // '' (not NULL) when absent, so the unique index below treats
          // "no sub order" rows as duplicates of each other too.
          subOrderNo: {
            type: Sequelize.STRING(120),
            allowNull: false,
            defaultValue: '',
          },
          sku: { type: Sequelize.STRING(255), allowNull: true },
          orderStatus: { type: Sequelize.STRING(50), allowNull: true },
          subOrderContribution: money(Sequelize),
          orderAmount: money(Sequelize),
          claimsCompensations: money(Sequelize),
          recoveriesCharges: money(Sequelize),
          netOrderAmount: money(Sequelize),
          syncedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('now'),
          },
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

      await queryInterface.addIndex(
        DETAILS,
        ['meeshoPaymentId', 'orderNo', 'subOrderNo'],
        {
          unique: true,
          name: 'meesho_payment_details_payment_order_unique',
          transaction,
        },
      );
      await queryInterface.addIndex(DETAILS, ['userId'], {
        name: 'meesho_payment_details_user_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable(DETAILS, { transaction });
      await queryInterface.removeColumn(PAYMENTS, 'detailsSyncedAt', {
        transaction,
      });
    });
  },
};
