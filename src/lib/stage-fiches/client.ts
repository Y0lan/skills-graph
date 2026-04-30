import type { Statut } from '../constants'

/**
 * Fetch / patch helpers for the stage-fiche endpoints, plus
 * localStorage draft persistence so a recruiter mid-typing through a
 * Cloud Run revision change doesn't lose their work.
 *
 * The server enforces optimistic-lock via `If-Match: <updatedAt>`. This
 * client always passes the last-known `updatedAt` it has — passing
 * undefined explicitly opts out (used on the very first save when no
 * row exists yet). On 409 the caller re-fetches and resolves.
 */

export interface FicheResponse {
  data: Record<string, unknown>
  updatedAt: string | null
  updatedBy: string | null
}

export class FicheConflictError extends Error {
  readonly currentUpdatedAt: string | null
  constructor(currentUpdatedAt: string | null) {
    super('Modifications conflictuelles')
    this.name = 'FicheConflictError'
    this.currentUpdatedAt = currentUpdatedAt
  }
}

export async function fetchStageFicheData(
  candidatureId: string,
  stage: Statut,
  init?: { signal?: AbortSignal },
): Promise<FicheResponse> {
  const r = await fetch(
    `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/stages/${encodeURIComponent(stage)}/data`,
    { credentials: 'include', signal: init?.signal },
  )
  if (!r.ok) {
    if (r.status === 404) return { data: {}, updatedAt: null, updatedBy: null }
    throw new Error(`Erreur fetch fiche: ${r.status}`)
  }
  return (await r.json()) as FicheResponse
}

export async function patchStageFicheData(
  candidatureId: string,
  stage: Statut,
  body: Record<string, unknown>,
  opts: { ifMatch?: string | null } = {},
): Promise<FicheResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch
  const r = await fetch(
    `/api/recruitment/candidatures/${encodeURIComponent(candidatureId)}/stages/${encodeURIComponent(stage)}/data`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    },
  )
  if (r.status === 409) {
    let currentUpdatedAt: string | null = null
    try {
      const j = (await r.json()) as { currentUpdatedAt?: string }
      currentUpdatedAt = j.currentUpdatedAt ?? null
    } catch { /* ignore */ }
    throw new FicheConflictError(currentUpdatedAt)
  }
  if (!r.ok) {
    let msg = `Erreur fiche: ${r.status}`
    try {
      const j = (await r.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return (await r.json()) as FicheResponse
}

// ─── Draft persistence (Y6) ─────────────────────────────────────────────

const DRAFT_PREFIX = 'stage-fiche-draft:'

interface StoredDraft {
  data: Record<string, unknown>
  basedOnUpdatedAt: string | null
  savedClientAt: string
}

function draftKey(candidatureId: string, stage: Statut): string {
  return `${DRAFT_PREFIX}${candidatureId}:${stage}`
}

export function persistDraft(
  candidatureId: string,
  stage: Statut,
  data: Record<string, unknown>,
  basedOnUpdatedAt: string | null,
): void {
  if (typeof window === 'undefined') return
  try {
    const payload: StoredDraft = {
      data,
      basedOnUpdatedAt,
      savedClientAt: new Date().toISOString(),
    }
    window.localStorage.setItem(draftKey(candidatureId, stage), JSON.stringify(payload))
  } catch { /* quota / disabled — skip silently */ }
}

export function readDraft(candidatureId: string, stage: Statut): StoredDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(draftKey(candidatureId, stage))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function clearDraft(candidatureId: string, stage: Statut): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(draftKey(candidatureId, stage)) } catch { /* skip */ }
}

/**
 * Decide whether a stored draft is still relevant. We restore when:
 *   - a draft exists, AND
 *   - the server's `updatedAt` matches what the draft was based on
 *     (i.e. nobody else has saved since), OR the server has no row yet
 *
 * If the server has a NEWER `updatedAt` than the draft was based on,
 * we keep the draft (caller surfaces "Brouillon récupéré, plus récent
 * que la version serveur") and let the recruiter pick a side.
 */
export function shouldRestoreDraft(
  draft: StoredDraft | null,
  serverUpdatedAt: string | null,
): boolean {
  if (!draft) return false
  if (Object.keys(draft.data).length === 0) return false
  // No server row yet → the draft is obviously the latest work.
  if (!serverUpdatedAt) return true
  // Draft was based on the same state we just fetched → it's our local edit.
  if (draft.basedOnUpdatedAt === serverUpdatedAt) return true
  // Server moved on since this draft was taken → still surface, let UI ask.
  return true
}
