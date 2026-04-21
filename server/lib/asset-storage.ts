import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDb } from './db.js'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data')
const ASSETS_DIR = path.join(DATA_DIR, 'assets')

export type AssetKind = 'cv_text' | 'lettre_text' | 'raw_pdf' | 'photo'

export interface AssetRecord {
  id: string
  candidateId: string
  kind: AssetKind
  mime: string | null
  sizeBytes: number
  sha256: string
  storagePath: string
  createdAt: string
}

/**
 * Content-addressed asset storage for candidate source documents. Dedupes by
 * (candidate_id, kind, sha256) — re-uploading the exact same CV for the same
 * candidate reuses the existing row. Files live under `$DATA_DIR/assets/<sha>`
 * (local dev). The interface is GCS-compatible so swapping to object storage
 * later is a single-file change.
 */
export function putAsset(params: {
  candidateId: string
  kind: AssetKind
  buffer: Buffer | string
  mime?: string | null
}): AssetRecord {
  const { candidateId, kind, mime = null } = params
  const buf = typeof params.buffer === 'string' ? Buffer.from(params.buffer, 'utf-8') : params.buffer
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')

  const existing = getDb().prepare(
    'SELECT id, candidate_id, kind, mime, size_bytes, sha256, storage_path, created_at FROM candidate_assets WHERE candidate_id = ? AND kind = ? AND sha256 = ?',
  ).get(candidateId, kind, sha256) as {
    id: string
    candidate_id: string
    kind: AssetKind
    mime: string | null
    size_bytes: number
    sha256: string
    storage_path: string
    created_at: string
  } | undefined

  if (existing) {
    // Ensure the on-disk file is still present (defensive against manual deletes).
    try {
      fs.accessSync(existing.storage_path)
    } catch {
      fs.mkdirSync(path.dirname(existing.storage_path), { recursive: true })
      fs.writeFileSync(existing.storage_path, buf)
    }
    return rowToRecord(existing)
  }

  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true })
  const storagePath = path.join(ASSETS_DIR, sha256)
  if (!fs.existsSync(storagePath)) {
    fs.writeFileSync(storagePath, buf)
  }

  const id = crypto.randomUUID()
  const sizeBytes = buf.byteLength
  getDb().prepare(
    'INSERT INTO candidate_assets (id, candidate_id, kind, mime, size_bytes, sha256, storage_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, candidateId, kind, mime, sizeBytes, sha256, storagePath)

  const row = getDb().prepare(
    'SELECT id, candidate_id, kind, mime, size_bytes, sha256, storage_path, created_at FROM candidate_assets WHERE id = ?',
  ).get(id) as {
    id: string
    candidate_id: string
    kind: AssetKind
    mime: string | null
    size_bytes: number
    sha256: string
    storage_path: string
    created_at: string
  }
  return rowToRecord(row)
}

export function getAssetById(id: string): AssetRecord | null {
  const row = getDb().prepare(
    'SELECT id, candidate_id, kind, mime, size_bytes, sha256, storage_path, created_at FROM candidate_assets WHERE id = ?',
  ).get(id) as {
    id: string
    candidate_id: string
    kind: AssetKind
    mime: string | null
    size_bytes: number
    sha256: string
    storage_path: string
    created_at: string
  } | undefined
  return row ? rowToRecord(row) : null
}

export function readAssetBuffer(id: string): Buffer | null {
  const record = getAssetById(id)
  if (!record) return null
  try {
    return fs.readFileSync(record.storagePath)
  } catch {
    return null
  }
}

export function getLatestAsset(candidateId: string, kind: AssetKind): AssetRecord | null {
  const row = getDb().prepare(
    'SELECT id, candidate_id, kind, mime, size_bytes, sha256, storage_path, created_at FROM candidate_assets WHERE candidate_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1',
  ).get(candidateId, kind) as {
    id: string
    candidate_id: string
    kind: AssetKind
    mime: string | null
    size_bytes: number
    sha256: string
    storage_path: string
    created_at: string
  } | undefined
  return row ? rowToRecord(row) : null
}

function rowToRecord(row: {
  id: string
  candidate_id: string
  kind: AssetKind
  mime: string | null
  size_bytes: number
  sha256: string
  storage_path: string
  created_at: string
}): AssetRecord {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    kind: row.kind,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  }
}
