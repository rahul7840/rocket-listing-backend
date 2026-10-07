'use strict';

const { randomUUID } = require('crypto');

/**
 * `listing.create` - how many listings a user may fill with a template, in total
 * (period null = lifetime). Free gets 100, every paid plan is unlimited.
 *
 * A plan with no row for a feature is denied by default, so every plan needs one.
 * Idempotent on the (planId, featureKey) unique index: a row that already exists
 * (e.g. a limit changed in the admin panel) is never overwritten.
 *
 * This does NOT touch `template.create` - its Free value comes from the earlier
 * seeder (5) or whatever was set in the admin panel. Set it to 10 there if needed.
 */
const FEATURES = [
  { code: 'FREE', limitValue: 100, isUnlimited: false },
  { code: 'PRO', limitValue: null, isUnlimited: true },
  { code: 'MAX', limitValue: null, isUnlimited: true },
  { code: 'ROCKET', limitValue: null, isUnlimited: true },
];

const FEATURE_KEY = 'listing.create';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const plans = await queryInterface.sequelize.query(
      'SELECT "planId", code FROM plans WHERE code IN (:codes);',
      {
        replacements: { codes: FEATURES.map((f) => f.code) },
        type: Sequelize.QueryTypes.SELECT,
      },
    );
    const planIdByCode = Object.fromEntries(
      plans.map((p) => [p.code, p.planId]),
    );

    const now = new Date();
    const rows = FEATURES.filter((f) => planIdByCode[f.code]).map((f) => ({
      planFeatureId: randomUUID(),
      planId: planIdByCode[f.code],
      featureKey: FEATURE_KEY,
      valueType: 'limit',
      boolValue: null,
      limitValue: f.limitValue,
      isUnlimited: f.isUnlimited,
      period: null,
      metadata: JSON.stringify({}),
      createdAt: now,
      updatedAt: now,
    }));

    if (rows.length) {
      await queryInterface.bulkInsert('plan_features', rows, {
        ignoreDuplicates: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('plan_features', {
      featureKey: FEATURE_KEY,
    });
  },
};
