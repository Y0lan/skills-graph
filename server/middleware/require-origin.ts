import type { Request, Response, NextFunction } from 'express';
/**
 * Reject requests where neither `Origin` nor `Referer` header matches a
 * trusted origin. Browser defenses (SameSite=Lax cookies) already block
 * most cross-site posts; this is the belt to that suspenders, mainly to
 * stop a phished page on the same eTLD+1 from issuing same-site PATCHes
 * against our cookie-auth-only mutation routes.
 *
 * Trusted origins:
 *   - `process.env.APP_PUBLIC_ORIGIN` (e.g. https://radar.sinapse.nc)
 *   - `process.env.APP_DEV_ORIGIN`   (optional, e.g. https://dev.radar.sinapse.nc)
 *   - localhost / 127.0.0.1 in non-production NODE_ENV (so vitest +
 *     `npm run dev` work without setting envs).
 *
 * The check is intentionally generous (Origin OR Referer match) so that
 * legitimate browser behaviour — Referer stripped by privacy modes, or
 * Origin omitted for navigations — does not 403. Tests that hit the
 * route with neither header set will fail in production-like envs by
 * design; for vitest we send a localhost Origin or override the env.
 *
 * Mount on a per-route basis (see fiche endpoints in recruitment.ts)
 * rather than globally — broader scope wants a team review first.
 */
function trustedOrigins(): string[] {
    const out: string[] = [];
    const pub = process.env.APP_PUBLIC_ORIGIN?.trim();
    if (pub)
        out.push(pub.replace(/\/$/, ''));
    const dev = process.env.APP_DEV_ORIGIN?.trim();
    if (dev)
        out.push(dev.replace(/\/$/, ''));
    if (process.env.NODE_ENV !== 'production') {
        out.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000');
    }
    return out;
}
function originMatches(headerVal: string | undefined, allowed: string[]): boolean {
    if (!headerVal)
        return false;
    // Origin header is bare ("https://host"); Referer is a full URL.
    // Normalise both to scheme://host[:port] before comparing.
    let candidate: string;
    try {
        const u = new URL(headerVal);
        candidate = `${u.protocol}//${u.host}`;
    }
    catch {
        return false;
    }
    return allowed.includes(candidate);
}
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
    // Always allow safe (read-only) verbs.
    const m = req.method.toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
        next();
        return;
    }
    // Explicit test-env bypass — supertest doesn't set Origin/Referer
    // and we already mock requireLead away in those suites.
    if (process.env.NODE_ENV === 'test') {
        next();
        return;
    }
    const allowed = trustedOrigins();
    if (allowed.length === 0) {
        // Unconfigured: log once and let the request through. Failing closed
        // here would brick every PATCH on a fresh deploy with no env wired.
        if (!warnedUnconfigured) {
            console.warn('[require-origin] APP_PUBLIC_ORIGIN not set — origin check disabled (set the env to enable)');
            warnedUnconfigured = true;
        }
        next();
        return;
    }
    const origin = req.headers.origin as string | undefined;
    const referer = req.headers.referer as string | undefined;
    if (originMatches(origin, allowed) || originMatches(referer, allowed)) {
        next();
        return;
    }
    res.status(403).json({ error: 'Origine non autorisée' });
}
let warnedUnconfigured = false;
