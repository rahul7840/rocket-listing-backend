'use strict';

const { randomUUID } = require('crypto');

/**
 * Free gets ONE payments sync, ever: `meesho.payments.sync` with no period is a standing cap, counted from the
 * user's successful syncs (PaymentsSyncCountResolver). Pro / Max / Rocket keep their daily limit of 1 from
 * 20260919110000-seed-meesho-payment-plan-features.js.
 *
 * Idempotent on the (planId, featureKey) unique index: an existing row (e.g. edited in the admin panel) is never
 * overwritten - change the limit there to give Free more.
 */
const FEATURE_KEY = 'meesho.payments.sync';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const plans = await queryInterface.sequelize.query(
      'SELECT "planId" FROM plans WHERE code = :code;',
      { replacements: { code: 'FREE' }, type: Sequelize.QueryTypes.SELECT },
    );
    if (plans.length === 0) return;

    const now = new Date();
    await queryInterface.bulkInsert(
      'plan_features',
      [
        {
          planFeatureId: randomUUID(),
          planId: plans[0].planId,
          featureKey: FEATURE_KEY,
          valueType: 'limit',
          boolValue: null,
          limitValue: 1,
          isUnlimited: false,
          period: null,
          metadata: JSON.stringify({}),
          createdAt: now,
          updatedAt: now,
        },
      ],
      { ignoreDuplicates: true },
    );
  },

  async down(queryInterface, Sequelize) {
    const plans = await queryInterface.sequelize.query(
      'SELECT "planId" FROM plans WHERE code = :code;',
      { replacements: { code: 'FREE' }, type: Sequelize.QueryTypes.SELECT },
    );
    if (plans.length === 0) return;
    await queryInterface.bulkDelete('plan_features', {
      planId: plans[0].planId,
      featureKey: FEATURE_KEY,
    });
  },
};
