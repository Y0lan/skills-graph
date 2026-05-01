import { describe, expect, it } from 'vitest'
import Database from '../../tests/helpers/postgres-sync-test-db.js'

describe('Postgres sync-test SQL dialect compatibility', () => {
  it('does not rewrite SQL-like text inside string literals or comments', () => {
    const db = new Database('postgres-dialect-literals')
    const row = db.prepare(`
      SELECT
        'INSERT OR REPLACE INTO catalog_meta' AS text_value,
        'json_extract(email_snapshot, ''$.messageId'')' AS json_text
      /* INSERT OR REPLACE INTO ignored_comment */
    `).get() as { text_value: string; json_text: string }

    expect(row.text_value).toBe('INSERT OR REPLACE INTO catalog_meta')
    expect(row.json_text).toBe("json_extract(email_snapshot, '$.messageId')")
  })

  it('fails loudly instead of silently downgrading INSERT OR REPLACE', () => {
    const db = new Database('postgres-dialect-replace')
    db.exec('CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT)')

    expect(() => {
      db.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', '5.1.0')").run()
    }).toThrow(/INSERT OR REPLACE is not supported/)
  })

  it('keeps supported JSON and datetime compatibility rewrites working', () => {
    const db = new Database('postgres-dialect-supported')
    db.exec('CREATE TABLE dialect_events (payload TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())')
    db.prepare('INSERT INTO dialect_events (payload) VALUES (?)').run(JSON.stringify({ messageId: 'msg_123' }))

    const row = db.prepare(`
      SELECT
        json_extract(payload, '$.messageId') AS message_id,
        datetime(created_at, '-1 days') < datetime('now') AS older_than_now
      FROM dialect_events
    `).get() as { message_id: string; older_than_now: boolean }

    expect(row.message_id).toBe('msg_123')
    expect(row.older_than_now).toBe(true)
  })
})
