import crypto from 'crypto'
import pg from 'pg'
import { inject } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.POSTGRES_SYNC_TEST_MODE = 'true'
process.env.PG_POOL_MIN = '0'
process.env.PG_POOL_MAX = process.env.PG_POOL_MAX ?? '4'
process.env.PGAPPNAME = 'skill-radar-vitest'

const providedDatabaseUrl = inject('databaseUrl') as string | undefined
const baseDatabaseUrl = providedDatabaseUrl ?? process.env.DATABASE_URL

if (baseDatabaseUrl) {
  const baseUrl = baseDatabaseUrl
  const workerState = (globalThis as unknown as { __vitest_worker__?: { filepath?: string } }).__vitest_worker__
  const schemaKey = workerState?.filepath ?? `${process.env.VITEST_POOL_ID ?? 'pool'}-${process.env.VITEST_WORKER_ID ?? 'worker'}-${Date.now()}-${Math.random()}`
  const schemaName = `vitest_${crypto.createHash('sha1').update(schemaKey).digest('hex').slice(0, 16)}`
  const pool = new pg.Pool({ connectionString: baseUrl, max: 1 })
  try {
    const { rows } = await pool.query('SELECT current_database() AS name')
    const databaseName = String(rows[0]?.name ?? '')
    if (!databaseName.includes('test')) {
      throw new Error(`[postgres-setup] Refusing to use non-test database: ${databaseName}`)
    }
    await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
    await pool.query(`CREATE SCHEMA ${schemaName}`)
  } finally {
    await pool.end()
  }
  const scopedUrl = new URL(baseUrl)
  scopedUrl.searchParams.set('options', `-csearch_path=${schemaName},public`)
  process.env.DATABASE_URL = scopedUrl.toString()
  ;(globalThis as unknown as { __skillRadarBaseDatabaseUrl?: string }).__skillRadarBaseDatabaseUrl = baseUrl
  ;(globalThis as unknown as { __skillRadarDatabaseUrl?: string }).__skillRadarDatabaseUrl = scopedUrl.toString()
}
