#!/usr/bin/env node
/**
 * Postgres operations helper for local maintenance.
 *
 *   node scripts/db-ops.mjs check
 *   node scripts/db-ops.mjs backup <path>
 *
 * Cloud SQL automated backups and PITR remain the production safety net. This
 * helper is for explicit operator dumps and startup smoke checks.
 */

import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { mkdirSync, statSync } from 'node:fs'
import pg from 'pg'

const { Pool } = pg
const DATABASE_URL = process.env.DATABASE_URL

function requireDatabaseUrl() {
  if (!DATABASE_URL) {
    console.error('[DB-OPS] DATABASE_URL is required')
    process.exit(2)
  }
  return DATABASE_URL
}

function pgDumpEnv(databaseUrl) {
  const parsed = new URL(databaseUrl)
  const env = { ...process.env }
  env.PGHOST = parsed.hostname
  env.PGPORT = parsed.port || '5432'
  env.PGUSER = decodeURIComponent(parsed.username)
  env.PGPASSWORD = decodeURIComponent(parsed.password)
  env.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  const sslMode = parsed.searchParams.get('sslmode')
  if (sslMode) env.PGSSLMODE = sslMode
  return env
}

async function cmdCheck() {
  const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 })
  try {
    await pool.query('SELECT 1')
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS tables
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `)
    console.log(`[DB-OPS] check: ok (${rows[0]?.tables ?? 0} public tables)`)
  } catch (err) {
    console.error(`[DB-OPS] check failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

function cmdBackup(target) {
  if (!target) {
    console.error('[DB-OPS] backup requires target path argument')
    process.exit(2)
  }
  mkdirSync(dirname(target), { recursive: true })
  try {
    const databaseUrl = requireDatabaseUrl()
    execFileSync('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file',
      target,
    ], { stdio: 'inherit', env: pgDumpEnv(databaseUrl) })
    const size = (statSync(target).size / 1024).toFixed(1)
    console.log(`[DB-OPS] backup -> ${target} (${size} KB)`)
  } catch (err) {
    console.error(`[DB-OPS] backup failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

const [, , cmd, ...args] = process.argv

switch (cmd) {
  case 'check':
    await cmdCheck()
    break
  case 'backup':
    cmdBackup(args[0])
    break
  default:
    console.error('Usage: node scripts/db-ops.mjs {check|backup <path>}')
    process.exit(2)
}
