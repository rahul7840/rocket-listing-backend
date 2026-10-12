'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_webhook_events', {
      paymentWebhookEventId: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      provider: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      // Razorpay's x-razorpay-event-id header - unique per event, identical on
      // retries, so it is the idempotency key.
      eventId: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      eventType: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      entityType: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      entityId: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('received', 'processed', 'failed'),
        allowNull: false,
        defaultValue: 'received',
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      processedAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex(
      'payment_webhook_events',
      ['provider', 'eventId'],
      { unique: true, name: 'payment_webhook_events_provider_event_id_unique' },
    );
    await queryInterface.addIndex(
      'payment_webhook_events',
      ['entityType', 'entityId'],
      { name: 'payment_webhook_events_entity' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_webhook_events');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_payment_webhook_events_status";',
    );
  },
};
