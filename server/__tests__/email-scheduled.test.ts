import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

/**
 * Scheduled-email lifecycle:
 *
 * 1. sendTransitionEmail with scheduledAt passes it through to Resend and
 *    returns { scheduled: true, messageId }.
 * 2. cancelScheduledEmail calls resend.emails.cancel and returns true on ok.
 * 3. cancelScheduledEmail surfaces Resend-side failures as false (so the
 *    undo endpoint knows NOT to revert the status — a false positive
 *    would leave the candidate getting a ghost email).
 * 4. Query logic for "pending scheduled emails" against a seeded sqlite:
 *    superseded by email_sent / email_cancelled / email_failed is excluded.
 */

const sendMock = vi.fn()
const cancelMock = vi.fn()

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock, cancel: cancelMock }
  },
}))

// We exercise the public functions without booting the full server.
beforeEach(() => {
  sendMock.mockReset()
  cancelMock.mockReset()
  process.env.RESEND_API_KEY = 're_test_dummy'
})

const { sendTransitionEmail, cancelScheduledEmail } = await import('../lib/email.js')

describe('sendTransitionEmail — scheduledAt', () => {
  it('passes scheduledAt through to Resend and flags scheduled=true', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_sched_123' }, error: null })

    const result = await sendTransitionEmail({
      to: 'candidate@example.com',
      candidateName: 'Alice',
      role: 'Dev Java',
      statut: 'refuse',
      scheduledAt: '2030-01-01T00:00:00Z',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    const payload = sendMock.mock.calls[0][0]
    expect(payload.scheduledAt).toBe('2030-01-01T00:00:00Z')
    expect(result).toEqual({ messageId: 'msg_sched_123', sent: true, scheduled: true })
  })

  it('omits scheduledAt and flags scheduled=undefined when not passed', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_now_999' }, error: null })

    const result = await sendTransitionEmail({
      to: 'candidate@example.com',
      candidateName: 'Bob',
      role: 'Dev',
      statut: 'skill_radar_envoye',
      evaluationUrl: 'https://radar.test/evaluate/xyz',
    })

    const payload = sendMock.mock.calls[0][0]
    expect(payload.scheduledAt).toBeUndefined()
    expect(result.scheduled).toBeUndefined()
    expect(result.sent).toBe(true)
  })
})

describe('cancelScheduledEmail', () => {
  it('returns true when Resend confirms cancellation', async () => {
    cancelMock.mockResolvedValueOnce({ data: { object: 'email', id: 'msg_abc' }, error: null })
    const ok = await cancelScheduledEmail('msg_abc')
    expect(cancelMock).toHaveBeenCalledWith('msg_abc')
    expect(ok).toBe(true)
  })

  it('returns false when Resend returns an error body', async () => {
    cancelMock.mockResolvedValueOnce({ data: null, error: { message: 'already-sent', name: 'validation_error' } })
    const ok = await cancelScheduledEmail('msg_late')
    expect(ok).toBe(false)
  })

  it('returns false when Resend throws', async () => {
    cancelMock.mockRejectedValueOnce(new Error('network'))
    const ok = await cancelScheduledEmail('msg_net')
    expect(ok).toBe(false)
  })

  it('is a safe no-op when RESEND_API_KEY is not set in test env', async () => {
    // VITEST=true is auto-set by vitest, so the helper hits its test branch.
    delete process.env.RESEND_API_KEY
    const ok = await cancelScheduledEmail('msg_no_key')
    expect(ok).toBe(true)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED in non-test env when RESEND_API_KEY is not set', async () => {
    // Simulate prod: clear the test env markers so the helper takes the
    // production branch. A misconfigured prod redeploy must NOT silently
    // claim cancellation success while Resend keeps sending.
    delete process.env.RESEND_API_KEY
    const prevNode = process.env.NODE_ENV
    const prevVitest = process.env.VITEST
    process.env.NODE_ENV = 'production'
    delete process.env.VITEST
    try {
      const ok = await cancelScheduledEmail('msg_prod')
      expect(ok).toBe(false)
      expect(cancelMock).not.toHaveBeenCalled()
    } finally {
      if (prevNode !== undefined) process.env.NODE_ENV = prevNode
      else delete process.env.NODE_ENV
      if (prevVitest !== undefined) process.env.VITEST = prevVitest
    }
  })
})

// ── Query logic: "pending scheduled emails for this candidature" ─────
// We exercise the same SQL the route handler uses (pre-bound to a throw-
// away sqlite) to confirm the filter correctly excludes superseded rows.

describe('findPendingScheduledEmails query shape', () => {
  let db: InstanceType<typeof Database>
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-email-'))
    db = new Database(path.join(tmp, 'test.db'))
    db.exec(`
      DROP TABLE IF EXISTS candidature_events;
      CREATE TABLE candidature_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidature_id TEXT NOT NULL,
        type TEXT NOT NULL,
        email_snapshot TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
  })

  afterAll(() => {
    try { db?.close() } catch { /* */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* */ }
  })

  function insertEvent(candId: string, type: string, messageId?: string) {
    db.prepare(`INSERT INTO candidature_events (candidature_id, type, email_snapshot) VALUES (?, ?, ?)`).run(
      candId,
      type,
      messageId ? JSON.stringify({ messageId, to: 'x@y.z', statut: 'refuse' }) : null,
    )
  }

  function pending(candId: string, afterEventId: number): Array<{ id: number; messageId: string | null }> {
    const rows = db.prepare(`
      SELECT id, email_snapshot
      FROM candidature_events
      WHERE candidature_id = ?
        AND type = 'email_scheduled'
        AND id > ?
      ORDER BY id DESC
    `).all(candId, afterEventId) as Array<{ id: number; email_snapshot: string | null }>
    const out: Array<{ id: number; messageId: string | null }> = []
    for (const row of rows) {
      const snap = row.email_snapshot ? JSON.parse(row.email_snapshot) as { messageId?: string } : {}
      const messageId = snap.messageId ?? null
      if (messageId) {
        const superseded = db.prepare(`
          SELECT 1 FROM candidature_events
          WHERE candidature_id = ?
            AND type IN ('email_sent', 'email_cancelled', 'email_failed')
            AND id > ?
            AND json_extract(email_snapshot, '$.messageId') = ?
          LIMIT 1
        `).get(candId, row.id, messageId)
        if (superseded) continue
      }
      out.push({ id: row.id, messageId })
    }
    return out
  }

  it('returns an open email_scheduled with no superseding event', async () => {
    insertEvent('cand-1', 'status_change')
    insertEvent('cand-1', 'email_scheduled', 'msg_A')

    const results = pending('cand-1', 0)
    expect(results).toHaveLength(1)
    expect(results[0].messageId).toBe('msg_A')
  })

  it('excludes scheduled emails that have been sent', async () => {
    insertEvent('cand-2', 'status_change')
    insertEvent('cand-2', 'email_scheduled', 'msg_B')
    insertEvent('cand-2', 'email_sent', 'msg_B')
    expect(pending('cand-2', 0)).toHaveLength(0)
  })

  it('excludes scheduled emails that have been cancelled', async () => {
    insertEvent('cand-3', 'status_change')
    insertEvent('cand-3', 'email_scheduled', 'msg_C')
    insertEvent('cand-3', 'email_cancelled', 'msg_C')
    expect(pending('cand-3', 0)).toHaveLength(0)
  })

  it('excludes scheduled emails that have been marked failed', async () => {
    insertEvent('cand-4', 'status_change')
    insertEvent('cand-4', 'email_scheduled', 'msg_D')
    insertEvent('cand-4', 'email_failed', 'msg_D')
    expect(pending('cand-4', 0)).toHaveLength(0)
  })

  it('keeps a scheduled email whose messageId differs from a later sent one (no false supersedes)', async () => {
    // Earlier scheduled email was sent (msg_E1); a NEW scheduled one (msg_E2) is pending.
    insertEvent('cand-5', 'status_change')
    insertEvent('cand-5', 'email_scheduled', 'msg_E1')
    insertEvent('cand-5', 'email_sent', 'msg_E1')
    insertEvent('cand-5', 'status_change')
    insertEvent('cand-5', 'email_scheduled', 'msg_E2')

    const results = pending('cand-5', 0)
    // Only msg_E2 is pending — msg_E1 has been superseded.
    expect(results).toHaveLength(1)
    expect(results[0].messageId).toBe('msg_E2')
  })

  it('filters out scheduled events that predate the given status-change cursor', async () => {
    insertEvent('cand-6', 'email_scheduled', 'msg_OLD') // id=1, before cursor
    const cursor = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    insertEvent('cand-6', 'status_change')
    insertEvent('cand-6', 'email_scheduled', 'msg_NEW')

    const results = pending('cand-6', cursor)
    expect(results.map(r => r.messageId)).toEqual(['msg_NEW'])
  })
})
