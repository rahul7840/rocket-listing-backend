'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Every table's primary key is now named <table>Id instead of the
      // generic "id" (users.id -> userId, templates.id -> templateId, etc).
      await queryInterface.renameColumn('users', 'id', 'userId', {
        transaction,
      });
      await queryInterface.renameColumn('recordings', 'id', 'recordingId', {
        transaction,
      });
      await queryInterface.renameColumn('templates', 'id', 'templateId', {
        transaction,
      });

      // Split the large actions/metadata payload out of templates into its
      // own table, keyed by templateId, so listing templates stays cheap.
      await queryInterface.createTable(
        'template_data',
        {
          templateDataId: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          templateId: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
            references: {
              model: 'templates',
              key: 'templateId',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
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
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
        { transaction },
      );

      await queryInterface.sequelize.query(
        `INSERT INTO template_data ("templateDataId", "templateId", actions, metadata, "createdAt", "updatedAt")
         SELECT gen_random_uuid(), "templateId", actions, metadata, "createdAt", "updatedAt"
         FROM templates;`,
        { transaction },
      );

      await queryInterface.removeColumn('templates', 'actions', {
        transaction,
      });
      await queryInterface.removeColumn('templates', 'metadata', {
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'templates',
        'actions',
        { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
        { transaction },
      );
      await queryInterface.addColumn(
        'templates',
        'metadata',
        { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE templates t
         SET actions = td.actions, metadata = td.metadata
         FROM template_data td
         WHERE td."templateId" = t."templateId";`,
        { transaction },
      );

      await queryInterface.dropTable('template_data', { transaction });

      await queryInterface.renameColumn('templates', 'templateId', 'id', {
        transaction,
      });
      await queryInterface.renameColumn('recordings', 'recordingId', 'id', {
        transaction,
      });
      await queryInterface.renameColumn('users', 'userId', 'id', {
        transaction,
      });
    });
  },
};
