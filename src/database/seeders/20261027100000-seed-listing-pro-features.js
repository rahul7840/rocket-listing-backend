'use strict';

const { randomUUID } = require('crypto');

/**
 * The Seller Insights card's three paid actions, as monthly limits: download all listing images (zip), the seller
 * listing price estimate and the detailed product report (PDF).
 *
 *  - Pro:          100 a month each (a starting value - change it in the admin panel, no redeploy needed).
 *  - Max, Rocket:  unlimited.
 *  - Free:         no row, which the backend denies by default.
 *
 * Idempotent on the (planId, featureKey) unique index: a row that already exists (e.g. a limit edited in the admin
 * panel) is never overwritten. Needs the plans seeder first (file order handles it).
 */
const FEATURE_KEYS = [
  'listing.images.download',
  'listing.price.estimate',
  'listing.report.pdf',
];
const PRO_MONTHLY_LIMIT = 100;
const PLANS = {
  PRO: { limitValue: PRO_MONTHLY_LIMIT, isUnlimited: false },
  MAX: { limitValue: null, isUnlimited: true },
  ROCKET: { limitValue: null, isUnlimited: true },
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const plans = await queryInterface.sequelize.query(
      'SELECT "planId", code FROM plans WHERE code IN (:codes);',
      {
        replacements: { codes: Object.keys(PLANS) },
        type: Sequelize.QueryTypes.SELECT,
      },
    );

    const now = new Date();
    const rows = [];
    for (const plan of plans) {
      for (const featureKey of FEATURE_KEYS) {
        rows.push({
          planFeatureId: randomUUID(),
          planId: plan.planId,
          featureKey,
          valueType: 'limit',
          boolValue: null,
          limitValue: PLANS[plan.code].limitValue,
          isUnlimited: PLANS[plan.code].isUnlimited,
          period: 'monthly',
          metadata: JSON.stringify({}),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (rows.length) {
      await queryInterface.bulkInsert('plan_features', rows, {
        ignoreDuplicates: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('plan_features', {
      featureKey: FEATURE_KEYS,
    });
  },
};
