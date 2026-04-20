import { getDb } from './db.js'

/**
 * Per-recruiter daily extraction budget so a accidental loop doesn't burn $$.
 * 50 runs/day (combined across types). 429 + clear error message on cap.
 *
 * See docs/decisions/2026-04-20-extraction-architecture.md.
 */

export const DAILY_RUN_CAP = 50

export class ExtractionBudgetExhausted extends Error {
  constructor(public readonly userSlug: string, public readonly day: string) {
    super(`Quota d’extractions atteint pour aujourd’hui (${DAILY_RUN_CAP}/jour). Réessayez demain ou contactez un admin.`)
    this.name = 'ExtractionBudgetExhausted'
  }
}

const today = (): string => new Date().toISOString().slice(0, 10)

export interface UsageSnapshot {
  day: string
  count: number
  tokens: number
  remaining: number
}

export function getCurrentUsage(userSlug: string): UsageSnapshot {
  const day = today()
  const row = getDb().prepare(
    'SELECT count, tokens_spent FROM extraction_usage WHERE user_slug = ? AND day = ?'
  ).get(userSlug, day) as { count: number; tokens_spent: number } | undefined
  return {
    day,
    count: row?.count ?? 0,
    tokens: row?.tokens_spent ?? 0,
    remaining: Math.max(0, DAILY_RUN_CAP - (row?.count ?? 0)),
  }
}

/**
 * Atomically check + record the start of an extraction run. Throws
 * ExtractionBudgetExhausted if the cap is reached. Token count of the
 * just-completed run can be reported back via recordTokens() once Anthropic
 * returns it.
 */
export function chargeRun(userSlug: string): UsageSnapshot {
  const day = today()
  const result = getDb().transaction(() => {
    const cur = getDb().prepare(
      'SELECT count, tokens_spent FROM extraction_usage WHERE user_slug = ? AND day = ?'
    ).get(userSlug, day) as { count: number; tokens_spent: number } | undefined
    if (cur && cur.count >= DAILY_RUN_CAP) {
      throw new ExtractionBudgetExhausted(userSlug, day)
    }
    getDb().prepare(`
      INSERT INTO extraction_usage (user_slug, day, count, tokens_spent)
      VALUES (?, ?, 1, 0)
      ON CONFLICT(user_slug, day) DO UPDATE SET count = extraction_usage.count + 1
    `).run(userSlug, day)
    return getDb().prepare(
      'SELECT count, tokens_spent FROM extraction_usage WHERE user_slug = ? AND day = ?'
    ).get(userSlug, day) as { count: number; tokens_spent: number }
  })()
  return {
    day,
    count: result.count,
    tokens: result.tokens_spent,
    remaining: Math.max(0, DAILY_RUN_CAP - result.count),
  }
}

/** Add token count to today's bucket once the LLM call returns. Best-effort. */
export function recordTokens(userSlug: string, tokens: number): void {
  const day = today()
  try {
    getDb().prepare(`
      UPDATE extraction_usage SET tokens_spent = tokens_spent + ?
      WHERE user_slug = ? AND day = ?
    `).run(tokens, userSlug, day)
  } catch {
    // Non-blocking — the run already counted; token tally is observability only.
  }
}
