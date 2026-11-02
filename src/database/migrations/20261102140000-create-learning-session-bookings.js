'use strict';

/**
 * Learning module: bookings for the one-to-one Meesho seller session, paid through Razorpay.
 * Adds ONE new table and its indexes. Nothing existing is altered or deleted.
 *
 * Indexes:
 *  - razorpayOrderId is unique (the key that webhooks and the verify call use).
 *  - a PARTIAL UNIQUE index on (sessionDate, slot) for paid bookings only, so a slot can be paid for
 *    once. Unpaid holds are checked in code, and "choose later" rows (null date) are not covered.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('learning_session_bookings', {
      bookingId: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: { type: Sequelize.STRING(80), allowNull: false },
      phone: { type: Sequelize.STRING(15), allowNull: false },
      goal: { type: Sequelize.TEXT, allowNull: true },
      sessionDate: { type: Sequelize.DATEONLY, allowNull: true },
      slot: { type: Sequelize.STRING(16), allowNull: true },
      // Smallest currency unit (paise).
      amount: { type: Sequelize.INTEGER, allowNull: false },
      currency: {
        type: Sequelize.STRING(8),
        allowNull: false,
        defaultValue: 'INR',
      },
      // pending | paid | refunded
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      razorpayOrderId: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      razorpayPaymentId: { type: Sequelize.STRING(64), allowNull: true },
      paidAt: { type: Sequelize.DATE, allowNull: true },
      refundedAt: { type: Sequelize.DATE, allowNull: true },
      needsNewSlot: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex(
      'learning_session_bookings',
      ['sessionDate', 'slot', 'status'],
      { name: 'learning_session_bookings_slot_status' },
    );
    await queryInterface.addIndex(
      'learning_session_bookings',
      ['razorpayPaymentId'],
      {
        name: 'learning_session_bookings_payment_id',
      },
    );
    await queryInterface.addIndex('learning_session_bookings', ['createdAt'], {
      name: 'learning_session_bookings_created_at',
    });
    // A slot can be paid for once. Raw SQL: sequelize-cli's addIndex cannot say WHERE on every version.
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX "learning_session_bookings_paid_slot"
         ON "learning_session_bookings" ("sessionDate", "slot")
       WHERE "status" = 'paid' AND "sessionDate" IS NOT NULL AND "slot" IS NOT NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('learning_session_bookings');
  },
};
