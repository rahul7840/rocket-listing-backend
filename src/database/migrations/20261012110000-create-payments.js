'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      paymentId: {
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
      planCode: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      interval: {
        type: Sequelize.ENUM('monthly', 'yearly'),
        allowNull: false,
      },
      // Smallest currency unit (paise for INR).
      amount: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING(8),
        allowNull: false,
        defaultValue: 'INR',
      },
      razorpayOrderId: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      razorpayPaymentId: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('created', 'paid', 'refunded'),
        allowNull: false,
        defaultValue: 'created',
      },
      // The access window this payment bought; set when it is fulfilled.
      periodStart: { type: Sequelize.DATE, allowNull: true },
      periodEnd: { type: Sequelize.DATE, allowNull: true },
      paidAt: { type: Sequelize.DATE, allowNull: true },
      // Set once the plan has been granted - makes fulfilment idempotent.
      fulfilledAt: { type: Sequelize.DATE, allowNull: true },
      refundedAt: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex('payments', ['userId'], {
      name: 'payments_user_id',
    });
    await queryInterface.addIndex('payments', ['razorpayPaymentId'], {
      name: 'payments_razorpay_payment_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payments');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_payments_interval";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_payments_status";',
    );
  },
};
