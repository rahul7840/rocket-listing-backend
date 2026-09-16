'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn('users', 'firebaseUid', 'googleId');
  },

  async down(queryInterface) {
    await queryInterface.renameColumn('users', 'googleId', 'firebaseUid');
  },
};
