'use strict';

/**
 * Filled from the Razorpay webhook (payment.contact) the first time a user pays; NULL until then.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'mobileNumber', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'mobileNumber');
  },
};
