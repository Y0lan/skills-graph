import crypto from 'crypto'
import { getDb } from './db.js'

export type ExtractionRunKind =
  | 'skills_baseline'
  | 'skills_role_aware'
  | 'profile'
  | 'critique'
  | 'reconcile'

export type ExtractionRunStatus = 'running' | 'success' | 'partial' | 'failed'

export interface StartRunParams {
  candidateId: string
  kind: ExtractionRunKind
  candidatureId?: string | null
  posteId?: string | null
  posteSnapshot?: Record<string, unknown> | null
  catalogVersion?: string | null
  promptVersion: number
  model: string
  cvAssetId?: string | null
  lettreAssetId?: string | null
}

export interface FinishRunParams {
  runId: string
  status: ExtractionRunStatus
  payload?: unknown
  error?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
}

/**
 * Open a new extraction run and return its id. Assigns a per-candidate
 * monotonic `run_index` so history UI can render a stable timeline.
 */
export function startRun(params: StartRunParams): string {
  const db = getDb()
  const id = crypto.randomUUID()
  const nextIndex = ((db.prepare(
    'SELECT COALESCE(MAX(run_index), 0) AS n FROM cv_extraction_runs WHERE candidate_id = ?',
  ).get(params.candidateId) as { n: number } | undefined)?.n ?? 0) + 1

  db.prepare(
    `INSERT INTO cv_extraction_runs (
       id, candidate_id, candidature_id, kind, run_index,
       poste_id, poste_snapshot, catalog_version, prompt_version,
       model, cv_asset_id, lettre_asset_id, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
  ).run(
    id,
    params.candidateId,
    params.candidatureId ?? null,
    params.kind,
    nextIndex,
    params.posteId ?? null,
    params.posteSnapshot ? JSON.stringify(params.posteSnapshot) : null,
    params.catalogVersion ?? null,
    params.promptVersion,
    params.model,
    params.cvAssetId ?? null,
    params.lettreAssetId ?? null,
  )
  return id
}

export function finishRun(params: FinishRunParams): void {
  getDb().prepare(
    `UPDATE cv_extraction_runs
        SET finished_at = datetime('now'),
            status = ?,
            payload = ?,
            error = ?,
            input_tokens = ?,
            output_tokens = ?
      WHERE id = ?`,
  ).run(
    params.status,
    params.payload !== undefined ? JSON.stringify(params.payload) : null,
    params.error ?? null,
    params.inputTokens ?? null,
    params.outputTokens ?? null,
    params.runId,
  )
}

export interface ExtractionRunRow {
  id: string
  candidateId: string
  candidatureId: string | null
  kind: ExtractionRunKind
  runIndex: number
  posteId: string | null
  posteSnapshot: Record<string, unknown> | null
  catalogVersion: string | null
  promptVersion: number
  model: string
  cvAssetId: string | null
  lettreAssetId: string | null
  startedAt: string
  finishedAt: string | null
  status: ExtractionRunStatus
  inputTokens: number | null
  outputTokens: number | null
  hasPayload: boolean
  error: string | null
}

export function listRuns(candidateId: string, limit = 50): ExtractionRunRow[] {
  const rows = getDb().prepare(
    `SELECT id, candidate_id, candidature_id, kind, run_index,
            poste_id, poste_snapshot, catalog_version, prompt_version,
            model, cv_asset_id, lettre_asset_id,
            started_at, finished_at, status, input_tokens, output_tokens,
            payload IS NOT NULL AS has_payload, error
       FROM cv_extraction_runs
      WHERE candidate_id = ?
      ORDER BY started_at DESC
      LIMIT ?`,
  ).all(candidateId, limit) as Array<{
    id: string
    candidate_id: string
    candidature_id: string | null
    kind: ExtractionRunKind
    run_index: number
    poste_id: string | null
    poste_snapshot: string | null
    catalog_version: string | null
    prompt_version: number
    model: string
    cv_asset_id: string | null
    lettre_asset_id: string | null
    started_at: string
    finished_at: string | null
    status: ExtractionRunStatus
    input_tokens: number | null
    output_tokens: number | null
    has_payload: number
    error: string | null
  }>

  return rows.map(r => ({
    id: r.id,
    candidateId: r.candidate_id,
    candidatureId: r.candidature_id,
    kind: r.kind,
    runIndex: r.run_index,
    posteId: r.poste_id,
    posteSnapshot: r.poste_snapshot ? JSON.parse(r.poste_snapshot) : null,
    catalogVersion: r.catalog_version,
    promptVersion: r.prompt_version,
    model: r.model,
    cvAssetId: r.cv_asset_id,
    lettreAssetId: r.lettre_asset_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    hasPayload: !!r.has_payload,
    error: r.error,
  }))
}

export function getRunPayload(runId: string): unknown | null {
  const row = getDb().prepare('SELECT payload FROM cv_extraction_runs WHERE id = ?').get(runId) as { payload: string | null } | undefined
  if (!row || !row.payload) return null
  return JSON.parse(row.payload)
}
