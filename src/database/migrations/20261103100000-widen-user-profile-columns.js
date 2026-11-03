'use strict';

/**
 * Google profile fields were varchar(255). A long profile picture URL or display name made sign-in fail
 * with "value too long for type character varying(255)" (HTTP 500 on POST /api/auth/google). Both are
 * free text from Google, so they become TEXT. Email stays varchar(255): an address is at most 254 characters.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'photoUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.changeColumn('users', 'displayName', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Cut anything over 255 first so the narrower type can be restored.
    await queryInterface.sequelize.query(
      'UPDATE "users" SET "photoUrl" = LEFT("photoUrl", 255), "displayName" = LEFT("displayName", 255)',
    );
    await queryInterface.changeColumn('users', 'photoUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn('users', 'displayName', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};
