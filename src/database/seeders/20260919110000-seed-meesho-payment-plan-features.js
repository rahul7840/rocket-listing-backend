'use strict';

const { randomUUID } = require('crypto');

/**
 * Default plan_features rows for the Meesho payments sync
 * (src/modules/meesho-payments). These are only STARTING values: the backend
 * never checks plan names, it reads plan_features live for the user's current
 * plan, so changing a row here (or in the admin panel) immediately changes
 * who gets the feature - no code change or redeploy needed.
 *
 *  - meesho.payments.sync    (limit, daily): Pro, Max, Rocket - 1 per day.
 *  - meesho.payments.details (boolean):      Max, Rocket.
 *
 * A plan with no row for a feature is denied by default (see
 * SubscriptionsService), so Free needs no entry. Idempotent on the
 * (planId, featureKey) unique index - existing rows (e.g. limits edited in
 * the admin panel) are never overwritten. Requires the plans seeder first
 * (file order handles it). Set up a fresh DB with `npm run db:setup`.
 */
const FEATURES = [
  ...['PRO', 'MAX', 'ROCKET'].map((code) => ({
    code,
    featureKey: 'meesho.payments.sync',
    valueType: 'limit',
    limitValue: 1,
    isUnlimited: false,
    period: 'daily',
  })),
  ...['MAX', 'ROCKET'].map((code) => ({
    code,
    featureKey: 'meesho.payments.details',
    valueType: 'boolean',
    boolValue: true,
  })),
];

const FEATURE_KEYS = [...new Set(FEATURES.map((f) => f.featureKey))];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const plans = await queryInterface.sequelize.query(
      'SELECT "planId", code FROM plans WHERE code IN (:codes);',
      {
        replacements: { codes: [...new Set(FEATURES.map((f) => f.code))] },
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
      featureKey: f.featureKey,
      valueType: f.valueType,
      boolValue: f.boolValue ?? null,
      limitValue: f.limitValue ?? null,
      isUnlimited: f.isUnlimited ?? false,
      period: f.period ?? null,
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
      featureKey: FEATURE_KEYS,
    });
  },
};
