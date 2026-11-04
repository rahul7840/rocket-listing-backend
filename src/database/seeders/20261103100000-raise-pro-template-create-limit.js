'use strict';

/**
 * Raises the PRO plan's template.create limit from 25 to 40. The original
 * seeder inserts with ignoreDuplicates, so editing it alone doesn't change
 * databases where the row already exists.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE plan_features SET "limitValue" = 40, "updatedAt" = NOW()
       WHERE "featureKey" = 'template.create'
         AND "planId" IN (SELECT "planId" FROM plans WHERE code = 'PRO');`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE plan_features SET "limitValue" = 25, "updatedAt" = NOW()
       WHERE "featureKey" = 'template.create'
         AND "planId" IN (SELECT "planId" FROM plans WHERE code = 'PRO');`,
    );
  },
};
