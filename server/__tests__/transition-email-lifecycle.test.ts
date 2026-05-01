import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transition-email-lifecycle-'))
process.env.DATA_DIR = tmpDir
process.env.RESEND_API_KEY = 're_test_dummy'

const sendMock = vi.fn()
const cancelMock = vi.fn()

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock, cancel: cancelMock }
  },
}))
vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('../middleware/require-lead.js', () => ({
  requireLead: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, { user: { id: 'u1', slug: 'yolan-maldonado', email: 'yolan@test', name: 'Yolan' } })
    next()
  },
}))
vi.mock('express-rate-limit', () => ({
  default: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')

function preSeed() {
  const db = new Database(TEST_DATABASE_HANDLE)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, label TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  db.close()
}

async function buildApp() {
  const { recruitmentRouter } = await import('../routes/recruitment.js')
  const app = express()
  app.use(express.json())
  app.use('/api/recruitment', recruitmentRouter)
  return app
}

function seedCandidature(statut = 'postule'): { candidatureId: string; candidateId: string; email: string } {
  const db = getDb()
  const roleId = `role-${crypto.randomUUID()}`
  db.prepare('INSERT INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'Developpeur', 'system')
  const posteId = `poste-${crypto.randomUUID()}`
  db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
    VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId, 'Developpeur Java')
  const candidateId = crypto.randomUUID()
  const email = `alice-${candidateId.slice(0, 8)}@example.com`
  db.prepare('INSERT INTO candidates (id, name, role, role_id, email, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
    candidateId, 'Alice Martin', 'Developpeur', roleId, email, 'system',
  )
  const candidatureId = crypto.randomUUID()
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)').run(
    candidatureId, candidateId, posteId, statut,
  )
  return { candidatureId, candidateId, email }
}

describe('transition email lifecycle', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })

  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    let n = 0
    sendMock.mockImplementation(async (payload: { scheduledAt?: string }) => {
      n += 1
      return { data: { id: payload.scheduledAt ? `msg_sched_${n}` : `msg_now_${n}` }, error: null }
    })
    cancelMock.mockResolvedValue({ data: { object: 'email', id: 'cancelled' }, error: null })
  })

  it('flushes the previous pending step email before scheduling the next emailed step', async () => {
    const { candidatureId, candidateId, email } = seedCandidature()
    const app = await buildApp()

    const first = await supertest(app)
      .patch(`/api/recruitment/candidatures/${candidatureId}/status`)
      .send({ statut: 'preselectionne', currentStatut: 'postule', sendEmail: true })
    expect(first.status).toBe(200)

    const second = await supertest(app)
      .patch(`/api/recruitment/candidatures/${candidatureId}/status`)
      .send({ statut: 'skill_radar_envoye', currentStatut: 'preselectionne', sendEmail: true })
    expect(second.status).toBe(200)

    expect(cancelMock).toHaveBeenCalledWith('msg_sched_1')
    expect(sendMock).toHaveBeenCalledTimes(3)
    expect(sendMock.mock.calls[1][0]).toEqual(expect.objectContaining({
      to: email,
      cc: ['contact@sinapse.nc'],
    }))
    expect(sendMock.mock.calls[1][0].scheduledAt).toBeUndefined()
    expect(sendMock.mock.calls[2][0]).toEqual(expect.objectContaining({
      to: email,
      cc: ['contact@sinapse.nc'],
      scheduledAt: expect.any(String),
    }))
    expect(sendMock.mock.calls[2][0].html).toContain(`/evaluate/${candidateId}`)

    const events = getDb().prepare(`
      SELECT type, email_snapshot FROM candidature_events
      WHERE candidature_id = ?
      ORDER BY id ASC
    `).all(candidatureId) as Array<{ type: string; email_snapshot: string | null }>
    const emailEvents = events
      .filter(e => e.email_snapshot)
      .map(e => ({ type: e.type, snapshot: JSON.parse(e.email_snapshot!) as Record<string, unknown> }))

    expect(emailEvents.map(e => e.type)).toEqual(['email_scheduled', 'email_sent', 'email_scheduled'])
    expect(emailEvents[1].snapshot).toMatchObject({
      statut: 'preselectionne',
      cancelledScheduleId: 'msg_sched_1',
      cc: ['contact@sinapse.nc'],
    })
    expect(emailEvents[2].snapshot).toMatchObject({
      statut: 'skill_radar_envoye',
      cc: ['contact@sinapse.nc'],
    })
  })

  it('cancels a previous pending email when the next transition explicitly skips email', async () => {
    const { candidatureId } = seedCandidature()
    const app = await buildApp()

    const first = await supertest(app)
      .patch(`/api/recruitment/candidatures/${candidatureId}/status`)
      .send({ statut: 'preselectionne', currentStatut: 'postule', sendEmail: true })
    expect(first.status).toBe(200)

    const second = await supertest(app)
      .patch(`/api/recruitment/candidatures/${candidatureId}/status`)
      .send({
        statut: 'skill_radar_envoye',
        currentStatut: 'preselectionne',
        sendEmail: false,
        skipEmailReason: 'Candidat contacte directement par telephone',
      })
    expect(second.status).toBe(200)

    expect(cancelMock).toHaveBeenCalledWith('msg_sched_1')
    expect(sendMock).toHaveBeenCalledTimes(1)

    const cancellation = getDb().prepare(`
      SELECT email_snapshot FROM candidature_events
      WHERE candidature_id = ? AND type = 'email_cancelled'
      ORDER BY id DESC LIMIT 1
    `).get(candidatureId) as { email_snapshot: string | null }
    expect(JSON.parse(cancellation.email_snapshot!)).toMatchObject({
      messageId: 'msg_sched_1',
      statut: 'preselectionne',
      cancelledBy: 'status-superseded',
    })
  })

  it('does not send the same candidate-facing status email twice', async () => {
    const { candidatureId, email } = seedCandidature('preselectionne')
    const db = getDb()
    db.prepare(`
      INSERT INTO candidature_events (candidature_id, type, statut_from, statut_to, stage, created_by)
      VALUES (?, 'status_change', 'postule', 'preselectionne', 'preselectionne', 'yolan-maldonado')
    `).run(candidatureId)
    db.prepare(`
      INSERT INTO candidature_events (candidature_id, type, notes, email_snapshot, created_by)
      VALUES (?, 'email_sent', 'Email deja envoye', ?, 'yolan-maldonado')
    `).run(candidatureId, JSON.stringify({
      recipient: 'candidate',
      to: email,
      statut: 'skill_radar_envoye',
      messageId: 'already-sent',
    }))

    const app = await buildApp()
    const res = await supertest(app)
      .patch(`/api/recruitment/candidatures/${candidatureId}/status`)
      .send({ statut: 'skill_radar_envoye', currentStatut: 'preselectionne', sendEmail: true })
    expect(res.status).toBe(200)

    expect(sendMock).not.toHaveBeenCalled()
    const row = db.prepare('SELECT statut FROM candidatures WHERE id = ?').get(candidatureId) as { statut: string }
    expect(row.statut).toBe('skill_radar_envoye')
    const event = db.prepare(`
      SELECT notes FROM candidature_events
      WHERE candidature_id = ? AND type = 'status_change'
      ORDER BY id DESC LIMIT 1
    `).get(candidatureId) as { notes: string | null }
    expect(event.notes).toContain('Email non envoyé')
    expect(event.notes).toContain('déjà envoyé')
  })
})
