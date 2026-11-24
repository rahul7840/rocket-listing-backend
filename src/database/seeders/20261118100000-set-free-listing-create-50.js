'use strict';

/**
 * Sets the FREE plan's `listing.create` to a lifetime limit of 50 (it was 100 from the first
 * seeder, and an edit from the admin panel could have left it empty). The earlier seeder inserts
 * with ignoreDuplicates, so editing it alone would not change a database where the row exists.
 * Creates the row if it is missing.
 */

const { randomUUID } = require('crypto');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [plan] = await queryInterface.sequelize.query(
      `SELECT "planId" FROM plans WHERE code = 'FREE';`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (!plan) return;

    const [updated] = await queryInterface.sequelize.query(
      `UPDATE plan_features
          SET "limitValue" = 50, "isUnlimited" = false, "valueType" = 'limit', "updatedAt" = NOW()
        WHERE "featureKey" = 'listing.create' AND "planId" = :planId
        RETURNING "planFeatureId";`,
      { replacements: { planId: plan.planId } },
    );
    if (updated.length) return;

    const now = new Date();
    await queryInterface.bulkInsert('plan_features', [
      {
        planFeatureId: randomUUID(),
        planId: plan.planId,
        featureKey: 'listing.create',
        valueType: 'limit',
        boolValue: null,
        limitValue: 50,
        isUnlimited: false,
        period: null,
        metadata: JSON.stringify({}),
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE plan_features SET "limitValue" = 100, "updatedAt" = NOW()
        WHERE "featureKey" = 'listing.create'
          AND "planId" IN (SELECT "planId" FROM plans WHERE code = 'FREE');`,
    );
  },
};
