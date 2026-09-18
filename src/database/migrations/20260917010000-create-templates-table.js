'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('templates', {
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
      clientId: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      domain: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      startUrl: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      startTitle: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      actions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      source: {
        type: Sequelize.ENUM('manual', 'meesho'),
        allowNull: false,
        defaultValue: 'manual',
      },
      playCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex('templates', ['clientId', 'userId'], {
      unique: true,
      name: 'templates_client_id_user_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('templates');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_templates_source";',
    );
  },
};
