import type { Request, Response, NextFunction } from 'express'
import type { AuthUser } from '../lib/types.js'

const RECRUITMENT_LEADS = [
  'yolan-maldonado',
  'olivier-faivre',
  'guillaume-benoit',
]

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
