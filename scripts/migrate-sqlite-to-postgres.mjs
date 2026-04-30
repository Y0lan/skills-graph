#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const initSqlPath = path.join(repoRoot, 'server', 'db', 'postgres-init.sql');
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE ?? 1000);

const TABLES = [
  'categories',
  'rating_scale',
  'calibration_prompts',
  'skills',
  'skill_descriptors',
  'catalog_meta',
  'evaluations',
  'comparison_summaries',
  'chat_usage',
  'skill_changes',
  'roles',
  'role_categories',
  'postes',
  'candidates',
  'candidatures',
  'candidature_events',
  'candidature_documents',
  'aboro_profiles',
  'candidature_stage_data',
  'candidature_reminders',
  'candidate_tags',
  'candidate_extractions',
  'candidate_field_overrides',
  'extraction_usage',
  'scan_overrides',
  'candidate_assets',
  'cv_extraction_runs',
  'scoring_weights',
  'poste_skill_requirements',
  'pole_categories',
  'user',
  'session',
  'account',
  'verification',
  'user_shortlists',
];

const IDENTITY_TABLES = ['skill_changes', 'candidature_events', 'candidature_reminders'];
const COLUMN_RENAMES = {
  candidatures: {
    drupal_submission_id: 'submission_uuid',
  },
};
const BOOLEAN_COLUMNS = new Set([
  'user.emailVerified',
]);

function usage() {
  console.error(`Usage:
  SQLITE_PATH=/path/to/ratings.db DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-postgres.mjs [--init]

Options:
  --init   Apply server/db/postgres-init.sql before importing.

The script imports in FK order with INSERT ... ON CONFLICT DO NOTHING and
fails unless every table has exact source/destination row-count parity.`);
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function tableRef(name) {
  return quoteIdent(name);
}

function sqliteTableExists(sqlite, table) {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
  return !!row;
}

function sqliteColumns(sqlite, table) {
  if (!sqliteTableExists(sqlite, table)) return [];
  return sqlite.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((row) => row.name);
}

async function pgColumns(pool, table) {
  const result = await pool.query(`
    SELECT column_name, data_type, udt_name, is_generated, is_identity
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position
  `, [table]);
  return result.rows
    .filter((row) => row.is_generated !== 'ALWAYS')
    .map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      isIdentity: row.is_identity === 'YES',
    }));
}

function sourceToDestMap(table) {
  return COLUMN_RENAMES[table] ?? {};
}

function mapColumns(table, sourceCols, destCols) {
  const rename = sourceToDestMap(table);
  const destByName = new Map(destCols.map((col) => [col.name, col]));
  const mapped = [];
  for (const source of sourceCols) {
    const destName = rename[source] ?? source;
    const dest = destByName.get(destName);
    if (dest) mapped.push({ source, dest });
  }
  if (table === 'candidatures' && !mapped.some((col) => col.dest.name === 'persisted_at') && sourceCols.includes('created_at') && destByName.has('persisted_at')) {
    mapped.push({ source: 'created_at', dest: destByName.get('persisted_at') });
  }
  return mapped;
}

function isJsonColumn(col) {
  return col.udtName === 'json' || col.udtName === 'jsonb';
}

function coerceValue(table, source, dest, value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (BOOLEAN_COLUMNS.has(`${table}.${dest.name}`)) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }
  if (isJsonColumn(dest)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        JSON.parse(trimmed);
      } catch (err) {
        throw new Error(`Invalid JSON while migrating ${table}.${source} into ${dest.name}: ${err.message}`);
      }
      return trimmed;
    }
    return JSON.stringify(value);
  }
  return value;
}

function buildInsert(table, mapped) {
  const cols = mapped.map(({ dest }) => quoteIdent(dest.name)).join(', ');
  const placeholders = mapped.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO ${tableRef(table)} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
}

async function setIdentitySequences(pool) {
  for (const table of IDENTITY_TABLES) {
    await pool.query(`
      SELECT setval(pg_get_serial_sequence('${tableRef(table)}', 'id'), COALESCE((SELECT MAX(id) FROM ${tableRef(table)}), 0) + 1, false)
    `);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    usage();
    return;
  }
  const sqlitePath = process.env.SQLITE_PATH;
  const databaseUrl = process.env.DATABASE_URL;
  if (!sqlitePath || !databaseUrl) {
    usage();
    process.exit(2);
  }
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLITE_PATH not found: ${sqlitePath}`);
  }
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 5000),
    query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS ?? 30000),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 10000),
  });
  const started = Date.now();
  try {
    if (args.has('--init')) {
      await pool.query(fs.readFileSync(initSqlPath, 'utf-8'));
    }
    const report = [];
    for (const table of TABLES) {
      const sourceCols = sqliteColumns(sqlite, table);
      const sourceExists = sourceCols.length > 0;
      const sourceCount = sourceExists ? sqlite.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(table)}`).get().c : 0;
      const destCols = await pgColumns(pool, table);
      if (destCols.length === 0) {
        throw new Error(`Destination table missing: ${table}`);
      }
      if (!sourceExists) {
        const dst = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM ${tableRef(table)}`)).rows[0].c);
        if (dst !== 0) throw new Error(`${table}: source missing but destination has ${dst} row(s)`);
        report.push({ table, source: 0, destination: 0, inserted: 0, ms: 0 });
        continue;
      }
      const mapped = mapColumns(table, sourceCols, destCols);
      if (mapped.length === 0 && sourceCount > 0) {
        throw new Error(`${table}: no shared columns but source has ${sourceCount} rows`);
      }
      const insertSql = buildInsert(table, mapped);
      const selectSql = `SELECT ${mapped.map(({ source }) => quoteIdent(source)).join(', ')} FROM ${quoteIdent(table)} LIMIT ? OFFSET ?`;
      const select = sqlite.prepare(selectSql);
      const t0 = Date.now();
      let inserted = 0;
      console.log(`[migration] ${table}: source=${sourceCount}`);
      for (let offset = 0; offset < sourceCount; offset += batchSize) {
        const rows = select.all(batchSize, offset);
        for (const row of rows) {
          const values = mapped.map(({ source, dest }) => coerceValue(table, source, dest, row[source]));
          const result = await pool.query(insertSql, values);
          inserted += result.rowCount ?? 0;
        }
        console.log(`[migration] ${table}: processed=${Math.min(offset + rows.length, sourceCount)} inserted=${inserted}`);
      }
      const destinationCount = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM ${tableRef(table)}`)).rows[0].c);
      report.push({ table, source: sourceCount, destination: destinationCount, inserted, ms: Date.now() - t0 });
      if (sourceCount !== destinationCount) {
        throw new Error(`${table}: row-count mismatch source=${sourceCount} destination=${destinationCount} inserted=${inserted}`);
      }
    }
    await setIdentitySequences(pool);
    console.table(report);
    console.log(`Migration completed in ${Date.now() - started}ms with exact row-count parity.`);
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate-sqlite-to-postgres] failed:', err);
  process.exit(1);
});
