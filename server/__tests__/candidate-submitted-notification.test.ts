import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from '../../tests/helpers/postgres-sync-test-db.js'
import express from 'express'
import supertest from 'supertest'

const sendCandidateSubmittedMock = vi.hoisted(() => vi.fn().mockResolvedValue(null))

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-submitted-notification-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))
vi.mock('../lib/email.js', () => ({
  sendCandidateSubmitted: sendCandidateSubmittedMock,
}))

const { initDatabase, getDb, TEST_DATABASE_HANDLE } = await import('../lib/db.js')

function preSeed() {
  const db = new Database(`${TEST_DATABASE_HANDLE}-candidate-submitted-notification`)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, label TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT INTO catalog_meta (key, value) VALUES ('version', '5.1.0') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const categoryInsert = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((cat, index) => categoryInsert.run(cat, cat, '*', index))
  db.prepare('INSERT OR IGNORE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)').run('java', 'core-engineering', 'Java', 0)
  db.close()
}

async function buildApp() {
  const { evaluateRouter } = await import('../routes/evaluate.js')
  const app = express()
  app.use(express.json())
  app.use('/api/evaluate', evaluateRouter)
  return app
}

function seedCandidate(createdBy: string): string {
  const db = getDb()
  const roleId = `role-${crypto.randomUUID()}`
  db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)').run(roleId, 'Dev', 'system')
  db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, 'core-engineering')
  const posteId = `poste-${crypto.randomUUID().slice(0, 8)}`
  db.prepare(`INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
    VALUES (?, ?, ?, 'java_modernisation', 1, 0, 0, '', 'CDIC')`).run(posteId, roleId, 'Dev Java')
  const candidateId = crypto.randomUUID()
  db.prepare('INSERT INTO candidates (id, name, role, role_id, email, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(candidateId, `Candidate ${createdBy}`, 'Dev', roleId, `${candidateId}@example.test`, createdBy)
  const candidatureId = crypto.randomUUID()
  db.prepare('INSERT INTO candidatures (id, candidate_id, poste_id, statut) VALUES (?, ?, ?, ?)')
    .run(candidatureId, candidateId, posteId, 'skill_radar_envoye')
  return candidateId
}

describe('POST /api/evaluate/:id/submit — submission notifications', () => {
  beforeAll(async () => {
    preSeed()
    await initDatabase()
  })

  afterAll(async () => {
    try { await getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('falls back to contact@sinapse.nc for Drupal-created candidates', async () => {
    sendCandidateSubmittedMock.mockClear()
    const candidateId = seedCandidate('drupal-webhook')
    const app = await buildApp()

    const res = await supertest(app)
      .post(`/api/evaluate/${candidateId}/submit`)
      .send({ ratings: { java: 4 }, experience: {}, skippedCategories: [] })

    expect(res.status).toBe(200)
    expect(sendCandidateSubmittedMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'contact@sinapse.nc',
    }))
  })

  it('keeps nominative notifications for real recruitment leads', async () => {
    sendCandidateSubmittedMock.mockClear()
    const candidateId = seedCandidate('yolan-maldonado')
    const app = await buildApp()

    const res = await supertest(app)
      .post(`/api/evaluate/${candidateId}/submit`)
      .send({ ratings: { java: 4 }, experience: {}, skippedCategories: [] })

    expect(res.status).toBe(200)
    expect(sendCandidateSubmittedMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'yolan.maldonado@sinapse.nc',
    }))
  })
})
