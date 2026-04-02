import type { Request, Response, NextFunction } from 'express'

const RECRUITMENT_LEADS = [
  'yolan-maldonado',
  'pierre-rossato',
  'alexandre-thomas',
  'olivier-faivre',
  'guillaume-benoit',
]

interface AuthUser {
  id: string
  slug: string | null
  [key: string]: unknown
}

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
