import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-merge-'))
process.env.DATA_DIR = tmpDir

vi.mock('../lib/seed-catalog.js', () => ({ seedCatalog: vi.fn() }))

const { initDatabase, getDb, DB_PATH } = await import('../lib/db.js')
const { emptyField, emptyProfile } = await import('../lib/profile-schema.js')
const { mergeProfiles, persistMergedProfile, setProfileFieldLock } = await import('../lib/profile-merge.js')

function preSeed() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  db.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', '5.1.0')").run()
  const cats = ['core-engineering','backend-integration','frontend-ui','platform-engineering','observability-reliability','security-compliance','architecture-governance','soft-skills-delivery','domain-knowledge','ai-engineering','qa-test-engineering','infrastructure-systems-network','analyse-fonctionnelle','project-management-pmo','change-management-training','design-ux','data-engineering-governance','management-leadership','legacy-ibmi-adelia','javaee-jboss']
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
  cats.forEach((c, i) => ins.run(c, c, '*', i))
  db.close()
}

function makeProfileWithPhone(phone: string | null, opts?: { sourceDoc?: 'cv' | 'lettre'; confidence?: number; locked?: boolean }) {
  const p = emptyProfile()
  p.contact.phone = {
    value: phone,
    runId: null,
    sourceDoc: phone ? (opts?.sourceDoc ?? 'cv') : null,
    confidence: phone ? (opts?.confidence ?? 0.9) : null,
    humanLockedAt: opts?.locked ? new Date().toISOString() : null,
    humanLockedBy: opts?.locked ? 'tester' : null,
  }
  return p
}

describe('profile-merge', () => {
  beforeAll(() => {
    preSeed()
    initDatabase()
  })
  afterAll(() => {
    try { getDb().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('mergeProfiles (pure function)', () => {
    it('new run populates empty profile', () => {
      const incoming = makeProfileWithPhone('+33612345678')
      const merged = mergeProfiles(null, incoming, { runId: 'run-1' })
      expect(merged.contact.phone.value).toBe('+33612345678')
      expect(merged.contact.phone.runId).toBe('run-1')
    })

    it('latest-wins when prior exists and incoming has value', () => {
      const base = makeProfileWithPhone('+33600000000')
      const incoming = makeProfileWithPhone('+33612345678')
      const merged = mergeProfiles(base, incoming, { runId: 'run-2' })
      expect(merged.contact.phone.value).toBe('+33612345678')
      expect(merged.contact.phone.runId).toBe('run-2')
    })

    it('preserves prior when incoming value is null (LLM omitted)', () => {
      const base = makeProfileWithPhone('+33600000000')
      const incoming = makeProfileWithPhone(null)
      const merged = mergeProfiles(base, incoming, { runId: 'run-2' })
      expect(merged.contact.phone.value).toBe('+33600000000')
    })

    it('locked field is NEVER overwritten', () => {
      const base = makeProfileWithPhone('+33600000000', { locked: true })
      const incoming = makeProfileWithPhone('+33699999999')
      const merged = mergeProfiles(base, incoming, { runId: 'run-2' })
      expect(merged.contact.phone.value).toBe('+33600000000')
      expect(merged.contact.phone.humanLockedAt).toBeTruthy()
    })

    it('experience array is replaced wholesale when incoming has entries', () => {
      const base = emptyProfile()
      base.experience = [{ company: 'Old Co', role: 'Dev', start: null, end: null, durationMonths: null, location: null, description: null, technologies: [] }]
      const incoming = emptyProfile()
      incoming.experience = [
        { company: 'New Co', role: 'Lead', start: null, end: null, durationMonths: null, location: null, description: null, technologies: [] },
        { company: 'Also New', role: 'IC', start: null, end: null, durationMonths: null, location: null, description: null, technologies: [] },
      ]
      const merged = mergeProfiles(base, incoming, { runId: 'run-2' })
      expect(merged.experience).toHaveLength(2)
      expect(merged.experience[0].company).toBe('New Co')
    })

    it('preserves prior experience when incoming has no entries', () => {
      const base = emptyProfile()
      base.experience = [{ company: 'Old Co', role: 'Dev', start: null, end: null, durationMonths: null, location: null, description: null, technologies: [] }]
      const incoming = emptyProfile()
      incoming.experience = []
      const merged = mergeProfiles(base, incoming, { runId: 'run-2' })
      expect(merged.experience).toHaveLength(1)
      expect(merged.experience[0].company).toBe('Old Co')
    })
  })

  describe('persistMergedProfile (DB integration)', () => {
    function seedCandidate(): string {
      const cid = crypto.randomUUID()
      getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(cid, 'T', 'T', 'system')
      return cid
    }

    it('persists on fresh candidate', () => {
      const cid = seedCandidate()
      const merged = persistMergedProfile(cid, makeProfileWithPhone('+33612345678'), 'run-1')
      expect(merged.contact.phone.value).toBe('+33612345678')
      const row = getDb().prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(cid) as { ai_profile: string }
      const stored = JSON.parse(row.ai_profile)
      expect(stored.contact.phone.value).toBe('+33612345678')
    })

    it('second run updates unlocked fields, preserves locked', () => {
      const cid = seedCandidate()
      persistMergedProfile(cid, makeProfileWithPhone('+33600000000'), 'run-1')
      setProfileFieldLock({ candidateId: cid, fieldPath: 'contact.phone', locked: true, userSlug: 'recruiter' })
      persistMergedProfile(cid, makeProfileWithPhone('+33699999999'), 'run-2')
      const row = getDb().prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(cid) as { ai_profile: string }
      const stored = JSON.parse(row.ai_profile)
      expect(stored.contact.phone.value).toBe('+33600000000')
      expect(stored.contact.phone.humanLockedAt).toBeTruthy()
    })

    it('null-in-new preserves prior across re-extraction', () => {
      const cid = seedCandidate()
      persistMergedProfile(cid, makeProfileWithPhone('+33611111111'), 'run-1')
      persistMergedProfile(cid, makeProfileWithPhone(null), 'run-2')
      const row = getDb().prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(cid) as { ai_profile: string }
      const stored = JSON.parse(row.ai_profile)
      expect(stored.contact.phone.value).toBe('+33611111111')
    })
  })

  describe('setProfileFieldLock', () => {
    function seedCandidate(): string {
      const cid = crypto.randomUUID()
      getDb().prepare('INSERT INTO candidates (id, name, role, created_by) VALUES (?, ?, ?, ?)').run(cid, 'T', 'T', 'system')
      return cid
    }

    it('locks an unlocked field', () => {
      const cid = seedCandidate()
      persistMergedProfile(cid, makeProfileWithPhone('+33611111111'), 'run-1')
      const result = setProfileFieldLock({ candidateId: cid, fieldPath: 'contact.phone', locked: true, userSlug: 'recruiter' })
      expect(result.ok).toBe(true)
      const row = getDb().prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(cid) as { ai_profile: string }
      const stored = JSON.parse(row.ai_profile)
      expect(stored.contact.phone.humanLockedAt).toBeTruthy()
      expect(stored.contact.phone.humanLockedBy).toBe('recruiter')
    })

    it('unlocks a locked field', () => {
      const cid = seedCandidate()
      persistMergedProfile(cid, makeProfileWithPhone('+33611111111'), 'run-1')
      setProfileFieldLock({ candidateId: cid, fieldPath: 'contact.phone', locked: true, userSlug: 'recruiter' })
      setProfileFieldLock({ candidateId: cid, fieldPath: 'contact.phone', locked: false, userSlug: 'recruiter' })
      const row = getDb().prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(cid) as { ai_profile: string }
      const stored = JSON.parse(row.ai_profile)
      expect(stored.contact.phone.humanLockedAt).toBeNull()
    })

    it('returns 404 for unknown candidate', () => {
      const result = setProfileFieldLock({ candidateId: 'ghost', fieldPath: 'contact.phone', locked: true, userSlug: null })
      expect(result.notFound).toBe(true)
    })

    it('rejects bad field paths', () => {
      const cid = seedCandidate()
      persistMergedProfile(cid, makeProfileWithPhone('+33611111111'), 'run-1')
      const result = setProfileFieldLock({ candidateId: cid, fieldPath: 'education', locked: true, userSlug: null })
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('emptyField helper', () => {
    it('returns a null ProfileField with no provenance', () => {
      const f = emptyField<string>()
      expect(f.value).toBeNull()
      expect(f.runId).toBeNull()
      expect(f.sourceDoc).toBeNull()
      expect(f.humanLockedAt).toBeNull()
    })
  })

  describe('lazy cleanup of legacy identity.photoAssetId', () => {
    it('persistMergedProfile strips photoAssetId from both incoming and stored row', () => {
      const candidateId = crypto.randomUUID()
      getDb().prepare(
        'INSERT INTO candidates (id, name, role, email, created_by, expires_at, ai_profile) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        candidateId,
        'Legacy Cand',
        'dev-backend',
        `${candidateId}@example.com`,
        'test-lead',
        new Date(Date.now() + 365 * 86400000).toISOString(),
        // Stored row still has the old photoAssetId key the auto-extractor left behind
        JSON.stringify({
          identity: {
            fullName: { value: null, runId: null, sourceDoc: null, confidence: null, humanLockedAt: null, humanLockedBy: null },
            photoAssetId: { value: 'legacy-asset', runId: 'old-run', sourceDoc: 'cv', confidence: 0.9, humanLockedAt: null, humanLockedBy: null },
          },
        }),
      )

      // Incoming profile from a normal new extraction. persistMergedProfile
      // should write a clean row with NO photoAssetId key at all.
      const incoming = emptyProfile()
      incoming.identity.fullName = { value: 'Alice Martin', runId: 'new-run', sourceDoc: 'cv', confidence: 0.95, humanLockedAt: null, humanLockedBy: null }

      persistMergedProfile(candidateId, incoming, 'new-run')

      const row = getDb().prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(candidateId) as { ai_profile: string }
      const parsed = JSON.parse(row.ai_profile)
      expect(parsed.identity.fullName.value).toBe('Alice Martin')
      expect('photoAssetId' in parsed.identity).toBe(false)
    })
  })
})
