import { describe, it, expect, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import supertest from 'supertest'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

/**
 * POST /api/recruitment/candidatures/:id/events/note
 *
 * Append-only companion to POST /notes (which overwrites the structured
 * evaluation JSON). Each call adds a fresh candidature_events row with
 * type='note' and content_md=<markdown>, turning the recruiter timeline
 * into a conversational stream of short notes — never mutating the
 * durable structured evaluation notes stored in candidatures.notes_directeur.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-timeline-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) } },
}))

// Skip rate limits in tests — we fire many requests in quick succession
// against the same mutation endpoints, which would otherwise 429.
vi.mock('express-rate-limit', () => ({
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  rateLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

// Stub the auth gate so we can exercise the route without booting full auth.
vi.mock('../middleware/require-lead.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/require-lead.js')>('../middleware/require-lead.js')
  return {
    ...actual,
    requireLead: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  }
})

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')

function preSeed(): void {
  // initDatabase seeds role_categories that FK into a categories row, which is
  // normally populated by lib/seed-catalog. The seed-catalog module is mocked
  // here (we don't want network or file IO during tests), so we pre-seed the
  // minimum category rows the migration path needs before initDatabase runs.
  const db = new Database(TEST_DATABASE_HANDLE)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  db.close()
}

async function buildApp(): Promise<express.Express> {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  // Attach a fake user so getUser(req) returns a stable slug.
  app.use((req, _res, next) => {
    (req as unknown as { user: { slug: string; role: string; email: string } }).user = {
      slug: 'yolan.test', role: 'lead', email: 'yolan@test.local',
    }
    next()
  })
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

function seedCandidatureFixture(): string {
  const db = getDb()
  const candidateId = `cand-${Math.random().toString(36).slice(2, 10)}`
  const candidatureId = `candidature-${Math.random().toString(36).slice(2, 10)}`
  // Reuse an existing role if one was seeded by initDatabase, else insert one.
  const role = db.prepare('SELECT id FROM roles LIMIT 1').get() as { id: string } | undefined
  const effectiveRoleId = role?.id ?? (() => {
    const id = `role-${Math.random().toString(36).slice(2, 10)}`
    db.prepare(`INSERT INTO roles (id, label, description, created_by) VALUES (?, ?, ?, ?)`).run(id, 'Dev', '', 'yolan.test')
    return id
  })()
  const posteId = db.prepare('SELECT id FROM postes LIMIT 1').get() as { id: string } | undefined
  const effectivePosteId = posteId?.id ?? (() => {
    const id = `poste-${Math.random().toString(36).slice(2, 10)}`
    db.prepare(`INSERT INTO postes (id, titre, role_id, created_by, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))`).run(id, 'Dev Java Senior', effectiveRoleId, 'yolan.test')
    return id
  })()
  db.prepare(`INSERT INTO candidates (id, name, role, role_id, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'))`)
    .run(candidateId, 'Test Candidate', 'Dev', effectiveRoleId, 'yolan.test')
  db.prepare(`INSERT INTO candidatures (id, candidate_id, poste_id, canal, statut, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
    .run(candidatureId, candidateId, effectivePosteId, 'site', 'postule')
  return candidatureId
}

// Single boot of preSeed + initDatabase shared across both describes —
// the Postgres-backed test connection lives inside lib/db.js's
// module state, so closing it in one suite's afterAll would leave the
// next suite trying to open a destroyed handle. Instead we boot once
// at module scope and clean up via a single afterAll at the bottom.
preSeed()
await initDatabase()

afterAll(async () => {
  try { await getDb().close() } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/recruitment/candidatures/:id/events/note', () => {

  it('appends a note event and returns the fresh row', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: 'Intéressant profil, **à recontacter** la semaine pro.' })
    expect(res.status).toBe(200)
    expect(res.body.id).toBeGreaterThan(0)
    expect(res.body.type).toBe('note')
    expect(res.body.contentMd).toBe('Intéressant profil, **à recontacter** la semaine pro.')
    expect(res.body.createdBy).toBe('yolan.test')
    expect(res.body.statutFrom).toBeNull()
    expect(res.body.statutTo).toBeNull()

    const rows = getDb().prepare(`SELECT type, content_md, created_by FROM candidature_events WHERE candidature_id = ?`).all(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({ type: 'note', content_md: 'Intéressant profil, **à recontacter** la semaine pro.', created_by: 'yolan.test' }),
    )
  })

  it('does NOT touch notes_directeur (structured evaluation notes)', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    getDb().prepare(`UPDATE candidatures SET notes_directeur = ? WHERE id = ?`)
      .run('{"forces":"OK"}', id)

    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: 'Note timeline indépendante' })
    expect(res.status).toBe(200)

    const row = getDb().prepare(`SELECT notes_directeur FROM candidatures WHERE id = ?`).get(id) as { notes_directeur: string | null }
    expect(row.notes_directeur).toBe('{"forces":"OK"}')
  })

  it('supports multiple append-only notes', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    await supertest(app).post(`/api/recruitment/candidatures/${id}/events/note`).send({ contentMd: 'Note 1' })
    await supertest(app).post(`/api/recruitment/candidatures/${id}/events/note`).send({ contentMd: 'Note 2' })
    await supertest(app).post(`/api/recruitment/candidatures/${id}/events/note`).send({ contentMd: 'Note 3' })

    const rows = getDb().prepare(`SELECT content_md FROM candidature_events WHERE candidature_id = ? ORDER BY id`).all(id) as { content_md: string }[]
    expect(rows.map(r => r.content_md)).toEqual(['Note 1', 'Note 2', 'Note 3'])
  })

  it('rejects missing contentMd with 400', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('contentMd requis')
  })

  it('rejects empty / whitespace-only contentMd with 400', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: '   \n\t ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('La note ne peut pas être vide')
  })

  it('rejects content over 5000 chars with 400', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const huge = 'x'.repeat(5001)
    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: huge })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Note trop longue (5000 caractères max)')
  })

  it('returns 404 for unknown candidature id', async () => {
    const app = await buildApp()
    const res = await supertest(app)
      .post('/api/recruitment/candidatures/does-not-exist/events/note')
      .send({ contentMd: 'hello' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Candidature introuvable')
  })

  // ─── v4.5: stage column + edit-in-place ──────────────────

  it('defaults stage to the candidature\'s current statut on insert', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    // Bump the candidature to preselectionne so the default stage isn't postule.
    getDb().prepare('UPDATE candidatures SET statut = ? WHERE id = ?').run('preselectionne', id)
    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: 'Sans override de stage' })
    expect(res.status).toBe(200)
    expect(res.body.stage).toBe('preselectionne')
  })

  it('honors an explicit stage override (retroactive note)', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    // Candidature is in 'postule'; recruiter retroactively pins a note to 'entretien_1'.
    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: 'Note rétroactive', stage: 'entretien_1' })
    expect(res.status).toBe(200)
    expect(res.body.stage).toBe('entretien_1')
  })

  it('returns updatedAt = null on a freshly-inserted note', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const res = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: 'Pas encore édité' })
    expect(res.body.updatedAt).toBeNull()
  })

  it('PATCH /events/note/:id edits in place and stamps updatedAt', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const created = await supertest(app)
      .post(`/api/recruitment/candidatures/${id}/events/note`)
      .send({ contentMd: 'Original' })
    expect(created.status).toBe(200)
    const eventId = created.body.id as number

    const edited = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/events/note/${eventId}`)
      .send({ contentMd: 'Édité' })
    expect(edited.status).toBe(200)
    expect(edited.body.id).toBe(eventId)
    expect(edited.body.contentMd).toBe('Édité')
    expect(edited.body.updatedAt).not.toBeNull()
    expect(typeof edited.body.updatedAt).toBe('string')

    // DB-level check: there's still ONE row (no chain), with updated content_md.
    const rows = getDb().prepare(`SELECT id, content_md, updated_at FROM candidature_events WHERE candidature_id = ? AND type = 'note'`).all(id) as { id: number; content_md: string; updated_at: string | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].content_md).toBe('Édité')
    expect(rows[0].updated_at).not.toBeNull()
  })

  it('PATCH /events/note/:id rejects edits to events that aren\'t notes', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    // Insert a status_change directly so we have a non-note event to target.
    const inserted = getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, statut_to, stage, created_by)
      VALUES (?, 'status_change', 'postule', 'postule', ?)
      RETURNING id
    `).get(id, 'yolan.test') as { id: number }
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${id}/events/note/${inserted.id}`)
      .send({ contentMd: 'Tentative invalide' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Seules les notes peuvent être éditées')
  })

  it('PATCH /events/note/:id 404s when event belongs to another candidature', async () => {
    const app = await buildApp()
    const idA = seedCandidatureFixture()
    const idB = seedCandidatureFixture()
    const created = await supertest(app)
      .post(`/api/recruitment/candidatures/${idA}/events/note`)
      .send({ contentMd: 'Note de A' })
    const eventId = created.body.id as number
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${idB}/events/note/${eventId}`)
      .send({ contentMd: 'Tentative cross-candidature' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/recruitment/candidature-documents/:id/event', () => {

  it('reassigns a document by stage by resolving the canonical event_id', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    // Seed a status_change to entretien_1 so the stage has a target event.
    const target = getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, stage, created_by)
      VALUES (?, 'status_change', 'postule', 'entretien_1', 'entretien_1', 'yolan.test')
      RETURNING id
    `).get(id) as { id: number }

    const docId = `doc-${Math.random().toString(36).slice(2, 10)}`
    getDb().prepare(`
      INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
      VALUES (?, ?, 'cv', 'cv.pdf', 'gs://bucket/cv.pdf', 'yolan.test')
    `).run(docId, id)

    const res = await supertest(app)
      .patch(`/api/recruitment/candidature-documents/${docId}/event`)
      .send({ stage: 'entretien_1' })
    expect(res.status).toBe(200)
    expect(res.body.eventId).toBe(target.id)

    const row = getDb().prepare(`SELECT event_id FROM candidature_documents WHERE id = ?`).get(docId) as { event_id: number | null }
    expect(row.event_id).toBe(target.id)
  })

  it('detaches the document (event_id=NULL) when no event exists for the requested stage', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const docId = `doc-${Math.random().toString(36).slice(2, 10)}`
    getDb().prepare(`
      INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
      VALUES (?, ?, 'cv', 'cv.pdf', 'gs://bucket/cv.pdf', 'yolan.test')
    `).run(docId, id)

    const res = await supertest(app)
      .patch(`/api/recruitment/candidature-documents/${docId}/event`)
      .send({ stage: 'aboro' })  // candidature has no event for this stage
    expect(res.status).toBe(200)
    expect(res.body.eventId).toBeNull()
  })

  it('rejects a payload with neither stage nor eventId', async () => {
    const app = await buildApp()
    const id = seedCandidatureFixture()
    const docId = `doc-${Math.random().toString(36).slice(2, 10)}`
    getDb().prepare(`
      INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
      VALUES (?, ?, 'cv', 'cv.pdf', 'gs://bucket/cv.pdf', 'yolan.test')
    `).run(docId, id)
    const res = await supertest(app)
      .patch(`/api/recruitment/candidature-documents/${docId}/event`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('stage ou eventId requis')
  })

  it('returns 404 for an unknown document id', async () => {
    const app = await buildApp()
    const res = await supertest(app)
      .patch('/api/recruitment/candidature-documents/does-not-exist/event')
      .send({ stage: 'postule' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Document introuvable')
  })

  it('rejects an explicit eventId that belongs to another candidature', async () => {
    const app = await buildApp()
    const idA = seedCandidatureFixture()
    const idB = seedCandidatureFixture()
    const stranger = getDb().prepare(`
      INSERT INTO candidature_events (candidature_id, type, statut_to, stage, created_by)
      VALUES (?, 'status_change', 'preselectionne', 'preselectionne', 'yolan.test')
      RETURNING id
    `).get(idA) as { id: number }

    const docId = `doc-${Math.random().toString(36).slice(2, 10)}`
    getDb().prepare(`
      INSERT INTO candidature_documents (id, candidature_id, type, filename, path, uploaded_by)
      VALUES (?, ?, 'cv', 'cv.pdf', 'gs://bucket/cv.pdf', 'yolan.test')
    `).run(docId, idB)
    const res = await supertest(app)
      .patch(`/api/recruitment/candidature-documents/${docId}/event`)
      .send({ eventId: stranger.id })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('eventId hors candidature')
  })
})
