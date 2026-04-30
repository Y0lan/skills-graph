import rateLimit from 'express-rate-limit';
/**
 * Rate limiters for the recruitment route family.
 *
 * Pre-extraction these were inline at the top of recruitment.ts. Once
 * the route splits into intake / transitions / fiches / admin
 * submodules, each submodule needs the same set of limiters; the
 * extraction step (#3a) lifts them here so the split doesn\'t fork
 * five copies. Codex post-plan P1 #4.
 *
 * Buckets and why:
 *
 * - `intakeRateLimit` — public Drupal webhook + intake. 10/min.
 * - `mutationRateLimit` — protected mutation endpoints (status,
 *   notes, canal, fiche data, reminders, tags). 20/min.
 * - `uploadRateLimit` — file uploads (CV/lettre/aboro). 10/min.
 * - `heavyRateLimit` — endpoints that fire LLM calls (re-extract,
 *   AI email draft, requirements extraction, batch operations).
 *   5/min; the budget guard in extraction-budget.ts is the per-day
 *   ceiling, this is the per-minute one.
 * - `recalcRateLimit` — full-pipeline recalculate. 2/min; expensive.
 */
export const intakeRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de candidatures. Réessayez dans une minute.' },
});
export const mutationRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
});
export const uploadRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de fichiers. Réessayez dans une minute.' },
});
export const heavyRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
});
export const recalcRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Recalcul en cours. Réessayez dans une minute.' },
});
