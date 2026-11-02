'use strict';

/**
 * Learning: link a session booking to the signed-in user who made it, so it can show on their dashboard.
 * Adds ONE nullable column (and an index) to the learning_session_bookings table made in
 * 20261102140000. Visitors who book without signing in keep a null userId, so nothing existing changes.
 * If a user is ever deleted, their bookings stay (userId becomes null) because they are payment records.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('learning_session_bookings', 'userId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'userId' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('learning_session_bookings', ['userId'], {
      name: 'learning_session_bookings_user_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('learning_session_bookings', 'userId');
  },
};
