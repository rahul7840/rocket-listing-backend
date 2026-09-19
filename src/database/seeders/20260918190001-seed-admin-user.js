'use strict';

const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

/**
 * Seeds one back-office admin account from ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD
 * (see .env.example). Idempotent: a no-op if a row with that email already
 * exists, and a no-op (with a warning) if the env vars aren't set at all -
 * this seeder is safe to run in any environment.
 */
module.exports = {
  async up(queryInterface) {
    const email = process.env.ADMIN_SEED_EMAIL;
    const password = process.env.ADMIN_SEED_PASSWORD;

    if (!email || !password) {
      console.warn(
        'Skipping admin user seed: ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD not set.',
      );
      return;
    }

    const [existing] = await queryInterface.sequelize.query(
      'SELECT "adminUserId" FROM admin_users WHERE email = :email',
      { replacements: { email } },
    );
    if (existing.length > 0) {
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    await queryInterface.bulkInsert('admin_users', [
      {
        adminUserId: randomUUID(),
        email,
        passwordHash,
        name: 'Admin',
        isActive: true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    const email = process.env.ADMIN_SEED_EMAIL;
    if (!email) {
      return;
    }
    await queryInterface.bulkDelete('admin_users', { email });
  },
};
