'use strict';

const SCHEMA = 'config';
const TABLE = { tableName: 'meesho_payments', schema: SCHEMA };

const money = (Sequelize) => ({
  type: Sequelize.DECIMAL(12, 2),
  allowNull: false,
  defaultValue: 0,
});

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First table outside `public` - synced third-party data (as opposed to
    // core app tables) lives in the `config` schema.
    await queryInterface.createSchema(SCHEMA);

    await queryInterface.createTable(TABLE, {
      meeshoPaymentId: {
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
      paymentDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      neftId: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      orderAmount: money(Sequelize),
      platformRecovery: money(Sequelize),
      adsCost: money(Sequelize),
      programCost: money(Sequelize),
      platformCompensation: money(Sequelize),
      referral: money(Sequelize),
      programBenefits: money(Sequelize),
      netAmount: money(Sequelize),
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

    // One payout row per user per payment date - the duplicate check the sync
    // relies on, enforced here too so concurrent syncs can't double-insert.
    await queryInterface.addIndex(TABLE, ['userId', 'paymentDate'], {
      unique: true,
      name: 'meesho_payments_user_date_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE);
    await queryInterface.dropSchema(SCHEMA);
  },
};
