'use strict';

/**
 * Optional autopay (Razorpay Subscriptions) after a one-time Pro purchase.
 * Two small tables; nothing existing is altered:
 *  - razorpay_plans: the Razorpay plan created for each (planCode, interval, amount),
 *    so a plan is created once and reused.
 *  - autopay_subscriptions: one row per Razorpay subscription a user set up.
 *
 * NOT run automatically. Run it on a copy of the database first.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('razorpay_plans', {
      razorpayPlanRowId: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      planCode: { type: Sequelize.STRING(32), allowNull: false },
      interval: { type: Sequelize.STRING(16), allowNull: false },
      // Smallest currency unit (paise). A price change makes a new row, never edits one.
      amount: { type: Sequelize.INTEGER, allowNull: false },
      razorpayPlanId: { type: Sequelize.STRING(64), allowNull: false, unique: true },
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
    await queryInterface.addIndex('razorpay_plans', ['planCode', 'interval', 'amount'], {
      name: 'razorpay_plans_lookup',
      unique: true,
    });

    await queryInterface.createTable('autopay_subscriptions', {
      autopayId: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'userId' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      planCode: { type: Sequelize.STRING(32), allowNull: false },
      interval: { type: Sequelize.STRING(16), allowNull: false },
      razorpaySubscriptionId: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      razorpayPlanId: { type: Sequelize.STRING(64), allowNull: false },
      // created | authenticated | active | pending | halted | cancelled | completed | expired | paused
      status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'created' },
      // When the first renewal is due (the end of the pass the user already paid for).
      startAt: { type: Sequelize.DATE, allowNull: false },
      totalCount: { type: Sequelize.INTEGER, allowNull: false },
      paidCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      lastChargedAt: { type: Sequelize.DATE, allowNull: true },
      // Set when the user asked to stop at the end of the current cycle.
      cancelRequestedAt: { type: Sequelize.DATE, allowNull: true },
      cancelledAt: { type: Sequelize.DATE, allowNull: true },
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
    await queryInterface.addIndex('autopay_subscriptions', ['userId', 'status'], {
      name: 'autopay_subscriptions_user_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('autopay_subscriptions');
    await queryInterface.dropTable('razorpay_plans');
  },
};
