import { getDb } from './db.js';
const DEFAULT_KEEP = 2; // per (candidate, kind)
/**
 * Retention policy for cv_extraction_runs payloads:
 *   - For each (candidate, kind), keep the `keep` most recent successful
 *     payloads. Older successful runs get their `payload` nulled (metadata
 *     preserved for analytics).
 *   - Rows older than `retention_days` (from scoring_weights.retention_days,
 *     default 90) with NULL payload are deleted entirely.
 *
 * Safe to call repeatedly — idempotent and cheap after the first pass.
 */
export interface RetentionStats {
    payloadsNulled: number;
    rowsDeleted: number;
}
export async function pruneExtractionRuns(opts: {
    keep?: number;
} = {}): Promise<RetentionStats> {
    const db = getDb();
    const keep = opts.keep ?? DEFAULT_KEEP;
    const retentionDays = (await db.prepare("SELECT retention_days FROM scoring_weights WHERE id = 'default'").get() as {
        retention_days: number | null;
    } | undefined)?.retention_days ?? 90;
    // Null out payloads beyond the per-candidate/kind keep window (success only)
    const nulled = await db.prepare(`UPDATE cv_extraction_runs
        SET payload = NULL
      WHERE payload IS NOT NULL
        AND id IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY candidate_id, kind ORDER BY started_at DESC) AS rn
              FROM cv_extraction_runs
             WHERE status = 'success'
          )
          WHERE rn > ?
        )`).run(keep);
    // Hard-delete payload-null rows older than retention window
    const deleted = await db.prepare(`DELETE FROM cv_extraction_runs
      WHERE payload IS NULL
        AND started_at < now() - (?::int * interval '1 day')`).run(retentionDays);
    return { payloadsNulled: nulled.changes ?? 0, rowsDeleted: deleted.changes ?? 0 };
}
