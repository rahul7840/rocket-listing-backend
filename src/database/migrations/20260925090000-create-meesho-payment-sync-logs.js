'use strict';

const SCHEMA = 'config';
const TABLE = { tableName: 'meesho_payment_sync_logs', schema: SCHEMA };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(TABLE, {
      syncLogId: {
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
      // 'payments' = Past Payments sync, 'details' = one payout's order details sync.
      kind: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      // Only set for kind = 'details' - which payout this run covered.
      paymentDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      received: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inserted: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      errorMessage: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
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
    });

    // Sync history lookups are always "this user's most recent runs".
    await queryInterface.addIndex(TABLE, ['userId', 'syncedAt'], {
      name: 'meesho_payment_sync_logs_user_synced_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE);
  },
};
