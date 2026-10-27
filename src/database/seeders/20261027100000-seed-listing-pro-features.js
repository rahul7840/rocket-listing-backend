'use strict';

const { randomUUID } = require('crypto');

/**
 * The three Seller Insights card actions: download all listing images, the seller listing price estimate and the
 * detailed product report (PDF). Pro, Max and Rocket have them; Free has the rows switched off (so the website's
 * plan table can show it) and is denied either way.
 *
 * Idempotent on the (planId, featureKey) unique index: a row that already exists (e.g. changed in the admin panel)
 * is never overwritten.
 */
const FEATURE_KEYS = [
  'listing.images.download',
  'listing.price.estimate',
  'listing.report.pdf',
];
const ENABLED = { FREE: false, PRO: true, MAX: true, ROCKET: true };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const plans = await queryInterface.sequelize.query(
      'SELECT "planId", code FROM plans WHERE code IN (:codes);',
      {
        replacements: { codes: Object.keys(ENABLED) },
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
          valueType: 'boolean',
          boolValue: ENABLED[plan.code],
          limitValue: null,
          isUnlimited: false,
          period: null,
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
