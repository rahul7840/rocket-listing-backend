'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_subscriptions', {
      userSubscriptionId: {
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
      planId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'plans',
          key: 'planId',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.ENUM('active', 'cancelled', 'expired', 'pending'),
        allowNull: false,
        defaultValue: 'active',
      },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
      currentPeriodStart: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      currentPeriodEnd: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancelAtPeriodEnd: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      source: {
        type: Sequelize.ENUM('admin', 'system', 'payment'),
        allowNull: false,
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

    // General lookup index for a user's full subscription history.
    await queryInterface.addIndex('user_subscriptions', ['userId'], {
      name: 'user_subscriptions_user_id',
    });

    // Enforces "only one current active subscription per user" at the DB
    // level: a partial unique index that only applies to status = 'active'
    // rows, so historical (cancelled/expired) rows never collide.
    await queryInterface.addIndex('user_subscriptions', ['userId'], {
      unique: true,
      name: 'user_subscriptions_user_id_active_unique',
      where: { status: 'active' },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_subscriptions');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_user_subscriptions_status";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_user_subscriptions_source";',
    );
  },
};
