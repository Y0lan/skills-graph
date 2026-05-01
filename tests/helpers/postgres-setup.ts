import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import pg from 'pg'

const statePath = path.join(process.cwd(), '.vitest-postgres-url')

process.env.NODE_ENV = 'test'
process.env.POSTGRES_SYNC_TEST_MODE = 'true'
process.env.PG_POOL_MIN = '0'
process.env.PG_POOL_MAX = process.env.PG_POOL_MAX ?? '4'
process.env.PGAPPNAME = 'skill-radar-vitest'

async function readGlobalDatabaseUrl(): Promise<string | null> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (fs.existsSync(statePath)) {
      return fs.readFileSync(statePath, 'utf-8').trim()
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = await readGlobalDatabaseUrl() ?? undefined
}

if (process.env.DATABASE_URL) {
  const baseUrl = process.env.DATABASE_URL
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
  scopedUrl.searchParams.set('options', `-c search_path=${schemaName},public`)
  process.env.DATABASE_URL = scopedUrl.toString()
}
