'use strict';

/**
 * lastLoginAt only moves on Google sign-in; lastActiveAt moves whenever an authenticated request arrives
 * (throttled in AuthService.touchLastActive), so admins can see when a user was last actually using the product.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'lastActiveAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'lastActiveAt');
  },
};
