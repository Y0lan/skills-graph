import fs from 'fs'
import path from 'path'
import pg from 'pg'

const statePath = path.join(process.cwd(), '.vitest-postgres-url')

process.env.NODE_ENV = 'test'
process.env.POSTGRES_SYNC_TEST_MODE = 'true'
process.env.PG_POOL_MIN = '0'
process.env.PG_POOL_MAX = process.env.PG_POOL_MAX ?? '4'
process.env.PGAPPNAME = 'skill-radar-vitest'

if (!process.env.DATABASE_URL && fs.existsSync(statePath)) {
  process.env.DATABASE_URL = fs.readFileSync(statePath, 'utf-8').trim()
}

if (process.env.DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  try {
    const { rows } = await pool.query('SELECT current_database() AS name')
    const databaseName = String(rows[0]?.name ?? '')
    if (!databaseName.includes('test')) {
      throw new Error(`[postgres-setup] Refusing to reset non-test database: ${databaseName}`)
    }
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE')
    await pool.query('CREATE SCHEMA public')
  } finally {
    await pool.end()
  }
}
