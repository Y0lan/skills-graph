import { getDb } from './db.js';
/**
 * Orphan-lock recovery for the CV extraction pipeline.
 *
 * The pipeline flips `candidates.extraction_status` to 'running' before work
 * starts (see `acquireExtractionLock` in cv-pipeline.ts) and only flips it
 * back inside the try-block's UPDATE or the catch-block's `markFailed`. When
 * the node process dies mid-pipeline (SIGTERM during deploy, OOM, probe
 * kill), neither runs — so the row stays `running` forever, the UI shows an
 * infinite "Extraction du CV en cours…" spinner, and the recruiter has no
 * way to recover short of a DB edit.
 *
 * Two layers of defense here:
 *   1. `startupSweep()` — called once at boot by `initDatabase()`. At boot,
 *      by definition no pipeline is running, so every 'running' row is
 *      orphan. Also sweeps the `cv_extraction_runs` audit trail.
 *   2. `startWatchdog()` / `stopWatchdog()` — started after `app.listen`,
 *      stopped in the SIGTERM/SIGINT handler before `getDb().close()`.
 *      Catches mid-flight hangs (network stall, Anthropic retry storm)
 *      after 10 minutes of wall time.
 *
 * Both drive off `lock_acquired_at` (for candidates) and `started_at`
 * (for runs) so first-attempt orphans with `last_extraction_at=NULL` are
 * handled correctly — a codex-challenge finding from rev 1 of the plan.
 */
const STALE_LOCK_MS = 10 * 60 * 1000; // 10 min — well past any legitimate Anthropic call
const SWEEP_INTERVAL_MS = 60000; // 1 min between watchdog ticks
let handle: NodeJS.Timeout | null = null;
export interface SweepResult {
    candidates: number;
    runs: number;
}
/**
 * Boot-time sweep of orphaned `running` state. Idempotent — running it
 * twice in a row on a clean DB flips nothing the second time.
 */
export async function startupSweep(): Promise<SweepResult> {
    const db = getDb();
    const candidates = (await db
        .prepare(`UPDATE candidates
         SET extraction_status = 'failed',
             lock_acquired_at = NULL,
             last_extraction_error = CASE
               WHEN last_extraction_error IS NULL OR last_extraction_error = ''
               THEN 'Process interrompu pendant l''extraction (reset au démarrage)'
               ELSE last_extraction_error || ' | Reset au démarrage'
             END
       WHERE extraction_status = 'running'`)
        .run()).changes;
    const runs = (await db
        .prepare(`UPDATE cv_extraction_runs
         SET status = 'partial',
             error = CASE
               WHEN error IS NULL OR error = ''
               THEN 'Process interrompu (reset au démarrage)'
               ELSE error || ' | Reset au démarrage'
             END,
             finished_at = COALESCE(finished_at, now())
       WHERE status = 'running'`)
        .run()).changes;
    if (candidates > 0 || runs > 0) {
        console.log(`[extraction-watchdog] startup sweep: ${candidates} candidate(s), ${runs} run(s) reset`);
    }
    return { candidates, runs };
}
/**
 * One watchdog tick. Flips any `running` row whose lock is older than the
 * stale threshold to `failed`.
 *
 * Candidates: driven by `lock_acquired_at`. Rows with `lock_acquired_at
 * IS NULL` are never touched by the watchdog — those are first-attempt
 * orphans that only the startup sweep catches (the process must crash
 * between lock acquisition and the next DB write for `lock_acquired_at`
 * to stay NULL, which is only possible very early in the pipeline).
 *
 * Runs: driven by `started_at`, which is always set when a run row exists.
 */
export async function sweepStaleExtractions(): Promise<SweepResult> {
    const db = getDb();
    const staleCutoffSeconds = STALE_LOCK_MS / 1000;
    const candidates = (await db
        .prepare(`UPDATE candidates
         SET extraction_status = 'failed',
             lock_acquired_at = NULL,
             last_extraction_error = 'Extraction timeout (watchdog reset après 10 min)'
       WHERE extraction_status = 'running'
         AND lock_acquired_at IS NOT NULL
         AND extract(epoch from (now() - lock_acquired_at)) > ?`)
        .run(staleCutoffSeconds)).changes;
    const runs = (await db
        .prepare(`UPDATE cv_extraction_runs
         SET status = 'partial',
             error = COALESCE(error, '') ||
                     CASE WHEN error IS NULL OR error = '' THEN ''
                          ELSE ' | '
                     END ||
                     'Watchdog timeout (reset après 10 min)',
             finished_at = now()
       WHERE status = 'running'
         AND extract(epoch from (now() - started_at)) > ?`)
        .run(staleCutoffSeconds)).changes;
    if (candidates > 0 || runs > 0) {
        console.log(`[extraction-watchdog] tick: ${candidates} candidate(s), ${runs} run(s) timed out`);
    }
    return { candidates, runs };
}
export function startWatchdog(): void {
    if (handle)
        return; // idempotent
    handle = setInterval(() => {
        sweepStaleExtractions().catch((err) => {
            console.error('[extraction-watchdog] tick failed:', err);
        });
    }, SWEEP_INTERVAL_MS);
    // unref so the interval doesn't hold the event loop open during shutdown
    handle.unref();
}
export function stopWatchdog(): void {
    if (!handle)
        return;
    clearInterval(handle);
    handle = null;
}
