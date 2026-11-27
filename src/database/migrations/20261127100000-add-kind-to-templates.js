'use strict';

/**
 * Templates now hold both kinds the extension makes: step recordings (every
 * row so far) and Smart Templates (Meesho form snapshots, which used to live
 * only in the browser). Existing rows are recordings, hence the default.
 *
 * Safe on a live database:
 *  - Adding a column with a constant default is a catalog-only change on
 *    Postgres 11+ (no table rewrite, existing rows are untouched).
 *  - Everything runs in one transaction: a failure leaves nothing behind.
 *  - lock_timeout: if another session holds the table, this gives up after a
 *    few seconds instead of queueing behind it and making every other query on
 *    the table wait too. Re-run it later; IF NOT EXISTS makes that safe.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`SET LOCAL lock_timeout = '5s'`);
      await run(`SET LOCAL statement_timeout = '60s'`);
      await run(
        `ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(16) NOT NULL DEFAULT 'recording'`,
      );
      await run(
        `CREATE INDEX IF NOT EXISTS "templates_user_id_kind" ON "templates" ("userId", "kind")`,
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`SET LOCAL lock_timeout = '5s'`);
      await run(`DROP INDEX IF EXISTS "templates_user_id_kind"`);
      await run(`ALTER TABLE "templates" DROP COLUMN IF EXISTS "kind"`);
    });
  },
};
