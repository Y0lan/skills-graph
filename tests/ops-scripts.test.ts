import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import SyncDatabase from './helpers/postgres-sync-test-db.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-scripts-'))
const previousEnv = {
  DATA_DIR: process.env.DATA_DIR,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  SKILL_RADAR_SKIP_BOOTSTRAP_SEED: process.env.SKILL_RADAR_SKIP_BOOTSTRAP_SEED,
}
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'
process.env.SKILL_RADAR_SKIP_BOOTSTRAP_SEED = 'true'

vi.mock('../server/lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../server/lib/db.js')
const { putAsset } = await import('../server/lib/asset-storage.js')
const { importTeamEvaluationsFromSqlite } = await import('../scripts/import-team-evaluations-from-sqlite.js')
const { freshStartRecruitCvReplay } = await import('../scripts/fresh-start-recruit-cv-replay.js')

function preSeed() {
  const db = new SyncDatabase(`${TEST_DATABASE_HANDLE}-ops-scripts`)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const insert = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((cat, index) => insert.run(cat, cat, '*', index))
  db.close()
}

function createSourceSqlite(): string {
  const sourcePath = path.join(tmpDir, `source-${Date.now()}-${Math.random()}.db`)
  const sqlite = new Database(sourcePath)
  sqlite.exec(`
    CREATE TABLE evaluations (
      slug TEXT PRIMARY KEY,
      ratings TEXT NOT NULL,
      experience TEXT NOT NULL,
      skipped_categories TEXT NOT NULL,
      declined_categories TEXT,
      submitted_at TEXT,
      profile_summary TEXT
    );
  `)
  sqlite.prepare(`
    INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories, submitted_at, profile_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('yolan-maldonado', JSON.stringify({ java: 4 }), JSON.stringify({ java: 2 }), JSON.stringify(['legacy']), JSON.stringify(['core-engineering']), '2026-01-01T00:00:00.000Z', 'stale')
  sqlite.prepare(`
    INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories, submitted_at, profile_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('legacy-ex-team-member', JSON.stringify({ java: 5 }), JSON.stringify({ java: 5 }), JSON.stringify([]), JSON.stringify([]), '2026-01-01T00:00:00.000Z', 'stale')
  sqlite.close()
  return sourcePath
}

describe('ops scripts', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })

  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    if (previousEnv.DATA_DIR === undefined) delete process.env.DATA_DIR
    else process.env.DATA_DIR = previousEnv.DATA_DIR
    if (previousEnv.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previousEnv.RESEND_API_KEY
    if (previousEnv.SKILL_RADAR_SKIP_BOOTSTRAP_SEED === undefined) delete process.env.SKILL_RADAR_SKIP_BOOTSTRAP_SEED
    else process.env.SKILL_RADAR_SKIP_BOOTSTRAP_SEED = previousEnv.SKILL_RADAR_SKIP_BOOTSTRAP_SEED
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('imports team evaluations from restored SQLite, then prunes pre-cutover test answers explicitly', async () => {
    const sourcePath = createSourceSqlite()
    await getDb().prepare(`
      INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories, submitted_at, profile_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (slug) DO UPDATE SET ratings = EXCLUDED.ratings
    `).run('alexandre-thomas', JSON.stringify({ java: 5 }), '{}', '[]', '[]', '2026-02-01T00:00:00.000Z', 'test data')
    await getDb().prepare(`
      INSERT INTO skill_changes (slug, skill_id, old_level, new_level)
      VALUES (?, ?, ?, ?)
    `).run('alexandre-thomas', 'java', 0, 5)
    await getDb().prepare(`
      INSERT INTO comparison_summaries (slug_a, slug_b, summary)
      VALUES (?, ?, ?)
      ON CONFLICT (slug_a, slug_b) DO UPDATE SET summary = EXCLUDED.summary
    `).run('alexandre-thomas', 'yolan-maldonado', 'stale')

    const dryRun = await importTeamEvaluationsFromSqlite({
      sourcePath,
      apply: false,
      initialize: false,
      pruneNonSource: true,
      resetSkillChanges: true,
    })
    expect(dryRun).toMatchObject({
      apply: false,
      totalSourceRows: 2,
      knownTeamRows: 1,
      unknownSlugs: ['legacy-ex-team-member'],
      importableRows: 1,
      skippedUnknownRows: 1,
      importedRows: 0,
    })
    expect(dryRun.prunedEvaluationRows).toBeGreaterThanOrEqual(1)
    expect(dryRun.resetSkillChangeRows).toBeGreaterThanOrEqual(1)
    expect(dryRun.clearedComparisonRows).toBeGreaterThanOrEqual(1)
    expect(await getDb().prepare('SELECT slug FROM evaluations WHERE slug = ?').get('yolan-maldonado')).toBeUndefined()

    const applied = await importTeamEvaluationsFromSqlite({
      sourcePath,
      apply: true,
      initialize: false,
      pruneNonSource: true,
      resetSkillChanges: true,
    })
    const appliedAgain = await importTeamEvaluationsFromSqlite({
      sourcePath,
      apply: true,
      initialize: false,
      pruneNonSource: true,
      resetSkillChanges: true,
    })
    expect(applied.importedRows).toBe(1)
    expect(appliedAgain.importedRows).toBe(1)
    expect(applied.skippedUnknownRows).toBe(1)
    expect(await getDb().prepare('SELECT slug FROM evaluations WHERE slug = ?').get('legacy-ex-team-member')).toBeUndefined()
    expect(await getDb().prepare('SELECT slug FROM evaluations WHERE slug = ?').get('alexandre-thomas')).toBeUndefined()
    expect(await getDb().prepare('SELECT slug FROM skill_changes WHERE slug = ?').get('alexandre-thomas')).toBeUndefined()
    expect(await getDb().prepare('SELECT slug_a FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?')
      .get('alexandre-thomas', 'alexandre-thomas')).toBeUndefined()

    const row = await getDb().prepare('SELECT ratings, experience, skipped_categories, declined_categories, submitted_at, profile_summary FROM evaluations WHERE slug = ?')
      .get('yolan-maldonado') as {
        ratings: string
        experience: string
        skipped_categories: string
        declined_categories: string
        submitted_at: string | null
        profile_summary: string | null
      }
    expect(JSON.parse(row.ratings)).toEqual({ java: 4 })
    expect(JSON.parse(row.experience)).toEqual({ java: 2 })
    expect(JSON.parse(row.skipped_categories)).toEqual(['legacy'])
    expect(JSON.parse(row.declined_categories)).toEqual(['core-engineering'])
    expect(row.submitted_at).toBeNull()
    expect(row.profile_summary).toBeNull()
  })

  it('fresh-start CV replay is dry-run by default and resets manual candidate fields on apply', async () => {
    const db = getDb()
    await db.prepare(`
      INSERT INTO candidates (id, name, role, email, created_by, ratings, experience, skipped_categories, declined_categories, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `).run(
      'replay-candidate',
      'Replay Candidate',
      'Dev',
      'replay@example.com',
      'test',
      JSON.stringify({ java: 5 }),
      JSON.stringify({ java: 4 }),
      JSON.stringify(['core-engineering']),
      JSON.stringify(['backend-integration']),
      '2026-01-01T00:00:00.000Z',
    )
    await db.prepare(`
      INSERT INTO roles (id, label, created_by)
      VALUES (?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `).run('replay-role', 'Replay Role', 'ops-test')
    await db.prepare(`
      INSERT INTO postes (id, role_id, titre, pole)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `).run('replay-poste', 'replay-role', 'Replay Poste', 'java_modernisation')
    await db.prepare(`
      INSERT INTO candidate_field_overrides (candidate_id, field_name, value, source, locked_by)
      VALUES (?, ?, ?::jsonb, ?, ?)
      ON CONFLICT (candidate_id, field_name) DO UPDATE SET value = EXCLUDED.value
    `).run('replay-candidate', 'role', JSON.stringify('Senior Developer'), 'recruiter', 'ops-test')
    const rawAsset = await putAsset({ candidateId: 'replay-candidate', kind: 'raw_pdf', buffer: Buffer.from('fake-pdf'), mime: 'application/pdf' })
    fs.rmSync(rawAsset.storagePath, { force: true })
    await db.prepare(`
      INSERT INTO candidatures (id, candidate_id, poste_id, statut, canal)
      VALUES (?, ?, ?, 'postule', 'site')
      ON CONFLICT (id) DO NOTHING
    `).run('replay-candidature', 'replay-candidate', 'replay-poste')
    const documentsDir = path.join(tmpDir, 'documents', 'replay-candidature')
    fs.mkdirSync(documentsDir, { recursive: true })
    const fallbackCvPath = path.join(documentsDir, 'fallback-cv.pdf')
    fs.writeFileSync(fallbackCvPath, 'fallback-pdf')
    await db.prepare(`
      INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
      VALUES (?, ?, 'cv', 'fallback-cv.pdf', ?, 'ops-test')
      ON CONFLICT (id) DO NOTHING
    `).run('replay-cv-document', 'replay-candidature', fallbackCvPath)

    const dryRun = await freshStartRecruitCvReplay({ apply: false, initialize: false })
    expect(dryRun.totalCandidatesWithRawPdf).toBeGreaterThanOrEqual(1)
    expect(dryRun.preservedFieldOverrides).toBeGreaterThanOrEqual(1)
    const dryRunLedger = await db.prepare(`
      SELECT 1 AS ok FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'ops_cv_replay_runs'
    `).get()
    expect(dryRunLedger).toBeUndefined()
    const processCv = vi.fn().mockResolvedValue({ candidateId: 'replay-candidate', status: 'succeeded', suggestionsCount: 0, failedCategories: [], failedCandidatures: [] })
    const applied = await freshStartRecruitCvReplay({ apply: true, concurrency: 1, initialize: false, processCv })
    expect(applied.replayedCandidates).toBeGreaterThanOrEqual(1)
    expect(applied.preservedFieldOverrides).toBeGreaterThanOrEqual(1)
    expect(applied.skippedAlreadyReplayed).toBe(0)
    expect(processCv).toHaveBeenCalledWith('replay-candidate', Buffer.from('fallback-pdf'), { source: 'reextract' })

    processCv.mockClear()
    const secondApply = await freshStartRecruitCvReplay({ apply: true, concurrency: 1, initialize: false, processCv })
    expect(secondApply.replayedCandidates).toBe(0)
    expect(secondApply.skippedAlreadyReplayed).toBeGreaterThanOrEqual(1)
    expect(processCv).not.toHaveBeenCalled()

    const row = await db.prepare('SELECT ratings, experience, skipped_categories, declined_categories, submitted_at FROM candidates WHERE id = ?')
      .get('replay-candidate') as {
        ratings: string
        experience: string
        skipped_categories: string
        declined_categories: string
        submitted_at: string | null
      }
    expect(JSON.parse(row.ratings)).toEqual({})
    expect(JSON.parse(row.experience)).toEqual({})
    expect(JSON.parse(row.skipped_categories)).toEqual([])
    expect(JSON.parse(row.declined_categories)).toEqual([])
    expect(row.submitted_at).toBeNull()
    const override = await db.prepare('SELECT value FROM candidate_field_overrides WHERE candidate_id = ? AND field_name = ?')
      .get('replay-candidate', 'role') as { value: string } | undefined
    expect(override).toBeDefined()
    expect(override?.value).toBe('Senior Developer')
  })
})
