import type { Request, Response, NextFunction } from 'express'
import type { AuthUser } from '../lib/types.js'

// First entry is the default lead used by intake-service for unattributed candidatures.
export const RECRUITMENT_LEADS: readonly string[] = [
  'yolan-maldonado',
  'olivier-faivre',
  'guillaume-benoit',
]

export const DEFAULT_LEAD_SLUG = RECRUITMENT_LEADS[0]

export function isRecruitmentLead(slug: string | null | undefined): boolean {
  return !!slug && RECRUITMENT_LEADS.includes(slug)
}

export function requireLead(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user: AuthUser }).user
  if (!isRecruitmentLead(user?.slug)) {
    res.status(403).json({ error: 'Accès réservé aux responsables recrutement' })
    return
  }
  next()
}
