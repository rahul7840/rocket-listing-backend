'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('usage_counters', {
      usageCounterId: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'userId',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      featureKey: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      periodType: {
        type: Sequelize.ENUM('daily', 'monthly', 'lifetime'),
        allowNull: false,
      },
      periodKey: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      usageCount: {
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

    // One counter row per (user, feature, period) - this is also the
    // conflict target for the atomic upsert-increment in UsageService.
    await queryInterface.addIndex(
      'usage_counters',
      ['userId', 'featureKey', 'periodType', 'periodKey'],
      {
        unique: true,
        name: 'usage_counters_user_feature_period_unique',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('usage_counters');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_usage_counters_periodType";',
    );
  },
};
