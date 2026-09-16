'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('recordings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      platform: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      sourceUrl: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      actions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      status: {
        type: Sequelize.ENUM('draft', 'ready', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('recordings');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_recordings_status";',
    );
  },
};
