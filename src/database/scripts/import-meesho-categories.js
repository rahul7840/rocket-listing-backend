'use strict';

/**
 * Loads the Meesho category tree into config.meesho_categories.
 *
 *   node src/database/scripts/import-meesho-categories.js <file.json> [--dry-run]
 *
 * Additive and idempotent: rows are upserted on (level, externalId), nothing is
 * ever deleted, and the whole import is one transaction. The DB connection
 * comes from the same .env / config.js the sequelize-cli uses.
 *
 * The exported file may have stray JSON-viewer sample blocks before/after the
 * real object, so the first balanced `{...}` that has an `items` array wins.
 */
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Sequelize } = require('sequelize');
const config = require('../config/config');

const LEVELS = [
  { level: 1, type: 'super-category' },
  { level: 2, type: 'category' },
  { level: 3, type: 'sub-category' },
  { level: 4, type: 'sub-sub-category' },
];
const CHUNK = 500;

function extractObject(text) {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          if (Array.isArray(parsed.items)) return parsed;
        } catch (_) {
          /* not the object we want, keep scanning */
        }
        break;
      }
    }
  }
  throw new Error('No object with an "items" array found in the file');
}

function buildRows(json) {
  const byType = Object.fromEntries(json.items.map((it) => [it.type, it.data]));
  return LEVELS.map(({ level, type }) => {
    const data = byType[type];
    if (!Array.isArray(data)) throw new Error(`Missing "${type}" in items`);
    return {
      level,
      type,
      rows: data.map((r) => ({
        externalId: Number(r.id),
        name: String(r.name).trim(),
        externalParentId: r.parent_id == null ? null : Number(r.parent_id),
        minProducts: r.data?.min_products ?? null,
        maxProducts: r.data?.max_products ?? null,
      })),
    };
  });
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) throw new Error('Usage: import-meesho-categories.js <file.json> [--dry-run]');
  const dryRun = flags.includes('--dry-run');

  const levels = buildRows(extractObject(fs.readFileSync(file, 'utf8')));

  // Validate every parent link before touching the DB.
  const ids = new Map(levels.map((l) => [l.level, new Set(l.rows.map((r) => r.externalId))]));
  for (const { level, type, rows } of levels) {
    const dupes = rows.length - ids.get(level).size;
    if (dupes) throw new Error(`${type}: ${dupes} duplicate ids`);
    if (level === 1) continue;
    const orphans = rows.filter((r) => !ids.get(level - 1).has(r.externalParentId));
    if (orphans.length) throw new Error(`${type}: ${orphans.length} rows with an unknown parent`);
  }
  for (const l of levels) console.log(`${l.type}: ${l.rows.length}`);
  if (dryRun) return console.log('Dry run - nothing written.');

  const { username, password, database, host, port, dialectOptions } = config[process.env.NODE_ENV || 'development'];
  const sequelize = new Sequelize(database, username, password, {
    host, port, dialect: 'postgres', dialectOptions, logging: false,
  });

  try {
    await sequelize.transaction(async (transaction) => {
      let parentIds = new Map(); // externalId -> our uuid, for the level above
      for (const { level, type, rows } of levels) {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const bind = [];
          const tuples = chunk.map((r, n) => {
            const p = n * 9;
            bind.push(
              randomUUID(), r.externalId, level, type, r.name,
              level === 1 ? null : parentIds.get(r.externalParentId),
              r.externalParentId, r.minProducts, r.maxProducts,
            );
            return `($${p + 1}::uuid,$${p + 2}::int,$${p + 3}::smallint,$${p + 4},$${p + 5},$${p + 6}::uuid,$${p + 7}::int,$${p + 8}::int,$${p + 9}::int)`;
          });
          await sequelize.query(
            `INSERT INTO config.meesho_categories
               ("meeshoCategoryId","externalId","level","type","name","parentId","externalParentId","minProducts","maxProducts")
             VALUES ${tuples.join(',')}
             ON CONFLICT ("level","externalId") DO UPDATE SET
               "name" = EXCLUDED."name",
               "parentId" = EXCLUDED."parentId",
               "externalParentId" = EXCLUDED."externalParentId",
               "minProducts" = EXCLUDED."minProducts",
               "maxProducts" = EXCLUDED."maxProducts",
               "updatedAt" = now()`,
            { bind, transaction },
          );
        }
        const [saved] = await sequelize.query(
          `SELECT "externalId","meeshoCategoryId" FROM config.meesho_categories WHERE level = $1`,
          { bind: [level], transaction },
        );
        parentIds = new Map(saved.map((r) => [r.externalId, r.meeshoCategoryId]));
        console.log(`level ${level} (${type}): upserted ${rows.length}`);
      }
    });
    const [[{ total }]] = await sequelize.query('SELECT count(*)::int AS total FROM config.meesho_categories');
    console.log(`Done. config.meesho_categories now has ${total} rows.`);
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
