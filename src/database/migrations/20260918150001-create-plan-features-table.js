'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('plan_features', {
      planFeatureId: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      planId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'plans',
          key: 'planId',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      featureKey: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      valueType: {
        type: Sequelize.ENUM('boolean', 'limit'),
        allowNull: false,
      },
      boolValue: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      limitValue: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      isUnlimited: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      period: {
        type: Sequelize.ENUM('daily', 'monthly'),
        allowNull: true,
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
    });

    await queryInterface.addIndex('plan_features', ['planId', 'featureKey'], {
      unique: true,
      name: 'plan_features_plan_id_feature_key_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plan_features');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_plan_features_valueType";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_plan_features_period";',
    );
  },
};
