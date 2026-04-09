import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { getAuth } from '../lib/auth.js'
import { getUser, type AuthUser } from '../lib/types.js'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getAuth().api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (!session) {
      res.status(401).json({ error: 'Non authentifie' })
      return
    }
    ;(req as Request & { user: AuthUser }).user = session.user as AuthUser
    next()
  } catch (err) {
    console.error('[AUTH] Session check failed:', err)
    res.status(401).json({ error: 'Non authentifie' })
  }
}

export async function requireOwnership(req: Request, res: Response, next: NextFunction) {
  const user = getUser(req)
  if (!user?.slug || user.slug !== req.params.slug) {
    res.status(403).json({ error: 'Acces refuse' })
    return
  }
  next()
}
