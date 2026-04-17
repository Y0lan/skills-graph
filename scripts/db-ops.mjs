#!/usr/bin/env node
/**
 * Database operations helper used by entrypoint.sh and preStop hooks.
 * Exposes three subcommands, all operating on the SQLite DB at $DB_PATH
 * (default /data/ratings.db):
 *
 *   node scripts/db-ops.mjs check           -> PRAGMA integrity_check.
 *                                              exit 0 if "ok", exit 1 otherwise.
 *   node scripts/db-ops.mjs backup <path>   -> atomic SQLite .backup to <path>.
 *                                              Consistent even during writes.
 *   node scripts/db-ops.mjs checkpoint      -> PRAGMA wal_checkpoint(TRUNCATE).
 *                                              Forces WAL contents into main DB.
 *
 * All commands open the DB with better-sqlite3 (already a dependency). They
 * never run the Node server, so they're safe to call during startup or
 * preStop without conflicting with the main process.
 */

import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const DB_PATH = process.env.DB_PATH || '/data/ratings.db'

function openDb(readonly = false) {
  return new Database(DB_PATH, { readonly, fileMustExist: true })
}

function cmdCheck() {
  let db
  try {
    db = openDb(true)
    const result = db.prepare('PRAGMA integrity_check').get()
    // SQLite returns { integrity_check: 'ok' } on success, or rows with error details.
    const value = result?.integrity_check ?? JSON.stringify(result)
    if (value === 'ok') {
      console.log('[DB-OPS] integrity_check: ok')
      process.exit(0)
    }
    console.error(`[DB-OPS] integrity_check FAILED: ${value}`)
    process.exit(1)
  } catch (err) {
    console.error(`[DB-OPS] integrity_check error: ${err.message}`)
    process.exit(1)
  } finally {
    db?.close()
  }
}

function cmdBackup(target) {
  if (!target) {
    console.error('[DB-OPS] backup requires target path argument')
    process.exit(2)
  }
  let db
  try {
    mkdirSync(dirname(target), { recursive: true })
    db = openDb(true)
    // better-sqlite3's .backup() uses SQLite's online backup API — atomic and
    // consistent even under concurrent writes. Returns a promise.
    db.backup(target).then(() => {
      console.log(`[DB-OPS] backup -> ${target}`)
      db.close()
      process.exit(0)
    }).catch(err => {
      console.error(`[DB-OPS] backup failed: ${err.message}`)
      db?.close()
      process.exit(1)
    })
  } catch (err) {
    console.error(`[DB-OPS] backup error: ${err.message}`)
    db?.close()
    process.exit(1)
  }
}

function cmdCheckpoint() {
  let db
  try {
    db = openDb(false)
    // TRUNCATE fully flushes WAL into the main DB and resets WAL size.
    const result = db.pragma('wal_checkpoint(TRUNCATE)')
    console.log(`[DB-OPS] wal_checkpoint: ${JSON.stringify(result)}`)
    process.exit(0)
  } catch (err) {
    console.error(`[DB-OPS] checkpoint error: ${err.message}`)
    process.exit(1)
  } finally {
    db?.close()
  }
}

const [, , cmd, ...args] = process.argv

switch (cmd) {
  case 'check': cmdCheck(); break
  case 'backup': cmdBackup(args[0]); break
  case 'checkpoint': cmdCheckpoint(); break
  default:
    console.error('Usage: node scripts/db-ops.mjs {check|backup <path>|checkpoint}')
    process.exit(2)
}
