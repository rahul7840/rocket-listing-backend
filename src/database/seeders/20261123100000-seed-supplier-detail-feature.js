'use strict';

const { randomUUID } = require('crypto');

/**
 * "Supplier details" on the Seller Insights card (plan feature `supplier_detail.show`), a monthly limit:
 *
 *  - Pro:          10 products a month (a starting value - change it in the admin panel, no redeploy needed).
 *  - Max, Rocket:  unlimited.
 *  - Free:         no row, which the backend denies by default.
 *
 * Idempotent on the (planId, featureKey) unique index: a row that already exists (e.g. a limit edited in the admin
 * panel) is never overwritten. Needs the plans seeder first (file order handles it).
 */
const FEATURE_KEY = 'supplier_detail.show';
const PLANS = {
  PRO: { limitValue: 10, isUnlimited: false },
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
    const rows = plans.map((plan) => ({
      planFeatureId: randomUUID(),
      planId: plan.planId,
      featureKey: FEATURE_KEY,
      valueType: 'limit',
      boolValue: null,
      limitValue: PLANS[plan.code].limitValue,
      isUnlimited: PLANS[plan.code].isUnlimited,
      period: 'monthly',
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
