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
  // Wrap SELECT MAX + INSERT in a transaction so two parallel webhooks
  // for the same candidate can\'t both compute the same run_index.
  // better-sqlite3 is sync per-call, but extraction call sites awaits
  // the LLM between starts; without the transaction, two concurrent
  // pipeline runs interleave SELECT/SELECT/INSERT/INSERT and produce
  // duplicate run_index values. Codex post-plan P2 #8.
  const tx = db.transaction((): string => {
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
  })
  return tx()
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

/**
 * Discriminated result type the wrapper passes to the caller. Lets each
 * call site keep its OWN failure semantics (mark candidate failed,
 * push to a failures[] array, return null upstream, throw, …) while
 * the wrapper centrally owns the `cv_extraction_runs` row lifecycle.
 *
 * Codex post-plan P1 #2: a `throwOnFailure` boolean wasn\'t expressive
 * enough. The wrapper\'s body returns one of these shapes; the caller
 * pattern-matches.
 */
export type ExtractionRunResult<T> =
  | { status: 'success'; payload: T; inputTokens?: number | null; outputTokens?: number | null }
  | { status: 'partial'; payload: T; error: string; inputTokens?: number | null; outputTokens?: number | null }
  | { status: 'failed'; error: string }

/**
 * `withExtractionRun` — opens a `cv_extraction_runs` row, runs the
 * caller\'s LLM/work function, closes the row with the right status
 * and tokens, returns the function\'s result envelope to the caller.
 *
 * **Use only for single-LLM-call lifecycles.** The skills-baseline
 * orchestration run in cv-pipeline.ts (kind=`skills_baseline`) spans
 * baseline + multipass + profile + role-aware + scoring across ~170
 * lines and stays manual — wrapping it would change the audit
 * meaning of "one orchestration run" to "one Anthropic call". Codex
 * post-plan P1 #3.
 *
 * Side effects the wrapper does NOT own:
 *   - `markFailed(candidateId, …)` / `markPartial(…)` writes to the
 *     candidate row.
 *   - `failures[].push(…)` for best-effort sites that continue past
 *     failure.
 *   - Throwing or returning null upstream.
 *
 * The caller decides those based on the discriminated result.
 *
 * Throws iff the inner function itself throws — the row is still
 * closed as `failed` in `finally` before the exception propagates.
 */
export async function withExtractionRun<T>(
  startParams: StartRunParams,
  fn: (runId: string) => Promise<ExtractionRunResult<T>>,
): Promise<ExtractionRunResult<T> & { runId: string }> {
  const runId = startRun(startParams)
  let result: ExtractionRunResult<T>
  try {
    result = await fn(runId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    finishRun({ runId, status: 'failed', error: message })
    throw err
  }

  if (result.status === 'success') {
    finishRun({
      runId,
      status: 'success',
      payload: result.payload,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
    })
  } else if (result.status === 'partial') {
    finishRun({
      runId,
      status: 'partial',
      payload: result.payload,
      error: result.error,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
    })
  } else {
    finishRun({ runId, status: 'failed', error: result.error })
  }

  return { ...result, runId }
}
