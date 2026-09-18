'use strict';

const { randomUUID } = require('crypto');

/**
 * template.create / template.delete configuration for the four plans, so
 * Phase 5's @RequiresLimit('template.create')/@RequiresFeature('template.delete')
 * on TemplatesController actually work instead of denying everyone (an
 * unconfigured feature denies by default - see SubscriptionsService).
 *
 * These numbers are placeholders reflecting the original ask (Free: up to 5
 * saved templates, can't delete) - adjust freely once the real feature
 * matrix is finalized; this seeder is idempotent either way.
 */
const FEATURES = [
  {
    code: 'FREE',
    featureKey: 'template.create',
    valueType: 'limit',
    limitValue: 5,
    isUnlimited: false,
  },
  {
    code: 'FREE',
    featureKey: 'template.delete',
    valueType: 'boolean',
    boolValue: false,
  },
  {
    code: 'PRO',
    featureKey: 'template.create',
    valueType: 'limit',
    limitValue: 25,
    isUnlimited: false,
  },
  {
    code: 'PRO',
    featureKey: 'template.delete',
    valueType: 'boolean',
    boolValue: true,
  },
  {
    code: 'MAX',
    featureKey: 'template.create',
    valueType: 'limit',
    limitValue: 100,
    isUnlimited: false,
  },
  {
    code: 'MAX',
    featureKey: 'template.delete',
    valueType: 'boolean',
    boolValue: true,
  },
  {
    code: 'ROCKET',
    featureKey: 'template.create',
    valueType: 'limit',
    isUnlimited: true,
  },
  {
    code: 'ROCKET',
    featureKey: 'template.delete',
    valueType: 'boolean',
    boolValue: true,
  },
];

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
    const rows = FEATURES.map((f) => ({
      planFeatureId: randomUUID(),
      planId: planIdByCode[f.code],
      featureKey: f.featureKey,
      valueType: f.valueType,
      boolValue: f.boolValue ?? null,
      limitValue: f.limitValue ?? null,
      isUnlimited: f.isUnlimited ?? false,
      period: null,
      metadata: JSON.stringify({}),
      createdAt: now,
      updatedAt: now,
    }));

    // Idempotent: (planId, featureKey) is unique - skip rows that already exist.
    await queryInterface.bulkInsert('plan_features', rows, {
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('plan_features', {
      featureKey: ['template.create', 'template.delete'],
    });
  },
};
