import type { Request, Response, NextFunction } from 'express'

/**
 * Auth gate for internal cron endpoints (the k8s CronJob hits these
 * with a shared secret). Different posture from `requireLead`:
 * `requireLead` reads the user from session cookies (Better Auth);
 * the cron has no user, just a token in `Authorization: Bearer <env>`.
 *
 * Env: `INTERNAL_CRON_TOKEN` set on both the server pod and the cron
 * job. If unset, the gate fails closed in production and warns once
 * in non-production (so local dev doesn't need to fiddle with secrets
 * to test the cron path manually).
 */
export function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.INTERNAL_CRON_TOKEN?.trim()
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[require-internal-token] INTERNAL_CRON_TOKEN not set — rejecting cron request')
      res.status(500).json({ error: 'Cron secret not configured' })
      return
    }
    if (!warnedUnconfigured) {
      console.warn('[require-internal-token] INTERNAL_CRON_TOKEN not set — open in non-production')
      warnedUnconfigured = true
    }
    next()
    return
  }
  const provided = req.headers['authorization']
  if (typeof provided !== 'string' || !provided.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization Bearer token requis' })
    return
  }
  if (provided.slice('Bearer '.length).trim() !== token) {
    res.status(401).json({ error: 'Token invalide' })
    return
  }
  next()
}

let warnedUnconfigured = false
