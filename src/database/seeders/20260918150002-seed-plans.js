'use strict';

const { randomUUID } = require('crypto');

const PLANS = [
  { name: 'Free', code: 'FREE', description: 'Default plan for new users.' },
  { name: 'Pro', code: 'PRO', description: null },
  { name: 'Max', code: 'MAX', description: null },
  { name: 'Rocket', code: 'ROCKET', description: null },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = PLANS.map((plan) => ({
      planId: randomUUID(),
      name: plan.name,
      code: plan.code,
      description: plan.description,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    // Idempotent: skip any code that already exists instead of erroring or duplicating.
    await queryInterface.bulkInsert('plans', rows, {
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('plans', {
      code: PLANS.map((plan) => plan.code),
    });
  },
};
