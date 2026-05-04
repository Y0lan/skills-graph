import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import InitialsBadge from '@/components/ui/initials-badge'
import { Mail, Phone, MapPin, Globe, Github, ChevronDown, FileText } from 'lucide-react'
import { formatPhone, cn } from '@/lib/utils'
import { formatDateHuman, parseAppDate } from '@/lib/constants'
import type { AiProfile } from './candidate-profile-card'

interface CandidateLike {
  id: string
  name: string
  email: string | null
  telephone?: string | null
  pays?: string | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  role: string
  canal?: string | null
  createdAt: string
  expiresAt: string
  aiProfile?: Record<string, unknown> | null
}

interface CandidatureLike {
  id: string
  posteTitre: string
}

interface TopSkill {
  skillId: string
  skillLabel: string
  rating: number
}

export interface CandidateIdentityStripProps {
  candidate: CandidateLike
  candidatures: CandidatureLike[]
  topSkills: TopSkill[]
  onToggleProfile?: () => void
  /** Whether the detailed profile is currently visible. Drives the
   *  toggle copy ("Voir" → "Masquer") and the `aria-expanded` state so
   *  screen readers know whether the disclosed region is open. */
  profileExpanded?: boolean
  /** Sticky detail headers need identity only; the full hero keeps skills,
   *  expiry metadata, and the profile disclosure action. */
  compact?: boolean
}

/** Editorial identity hero. Avatar + name + compact contact + top skills
 *  + metadata strip. Works with or without aiProfile: when the CV has
 *  been extracted, the subtitle pulls role-at-company + location from
 *  the profile; otherwise it falls back to the candidate's stringy role
 *  and the list of poste titres from their candidatures.
 *
 *  Full LinkedIn-style dossier lives behind the "Voir profil détaillé"
 *  disclosure at the bottom of the page — this strip is the scan-in-2-
 *  seconds hero, not the dossier. */
export default function CandidateIdentityStrip({
  candidate,
  candidatures,
  topSkills,
  onToggleProfile,
  profileExpanded = false,
  compact = false,
}: CandidateIdentityStripProps) {
  const [nowMs] = useState(() => Date.now())
  const profile = candidate.aiProfile as Partial<AiProfile> | null | undefined
  const profileRole = profile?.currentRole?.role?.value
  const profileCompany = profile?.currentRole?.company?.value
  const profileCity = profile?.location?.city?.value
  const profileCountry = profile?.location?.country?.value
  const profileExp = profile?.totalExperienceYears?.value

  const subtitle = (() => {
    // Prefer AI-extracted "Role @ Company" when present.
    if (profileRole || profileCompany) {
      const left = [profileRole, profileCompany].filter(Boolean).join(' @ ')
      const loc = [profileCity, profileCountry].filter(Boolean).join(', ')
      const parts = [left, loc, profileExp ? `${profileExp} ans d'exp.` : null].filter(Boolean)
      return parts.join(' · ')
    }
    // Fallback: concatenate poste titres from candidatures, else candidate.role.
    if (candidatures.length > 0) {
      return candidatures.map(c => c.posteTitre).filter(Boolean).join(' · ')
    }
    return candidate.role
  })()

  const expired = (parseAppDate(candidate.expiresAt)?.getTime() ?? 0) < nowMs

  return (
    <div className={compact ? '' : 'border-b pb-5 mb-6'}>
      <div className={compact ? 'flex items-center gap-3' : 'flex items-start gap-4'}>
        <InitialsBadge name={candidate.name} size={compact ? 'md' : 'lg'} />

        <div className="flex-1 min-w-0">
          {/* Name + multi-candidatures chip + profile disclosure trigger */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1
              className={compact ? 'text-xl font-bold tracking-tight' : 'text-2xl font-bold tracking-tight'}
              style={{ fontFamily: "'Raleway Variable', sans-serif" }}
            >
              {candidate.name}
            </h1>
            {candidatures.length > 1 && (
              <Badge
                variant="outline"
                className="text-[11px] font-normal"
                title="Ce candidat a plusieurs candidatures actives"
              >
                {candidatures.length} candidatures
              </Badge>
            )}
            {onToggleProfile && !compact && (
              <button
                type="button"
                onClick={onToggleProfile}
                aria-expanded={profileExpanded}
                aria-controls="candidate-profile-disclosure"
                className={cn(
                  'ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  profileExpanded
                    ? 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                {profileExpanded ? 'Masquer message + profil' : 'Voir message + profil détaillé'}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    profileExpanded && 'rotate-180',
                  )}
                />
              </button>
            )}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}

          {/* Contact row — mirrors the current fallback identity header
              exactly: email (mailto), phone (formatted), country, LinkedIn,
              GitHub. Only renders each item when present. */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground max-w-full">
            {candidate.email && (
              <a
                href={`mailto:${candidate.email}`}
                className="flex items-center gap-1 hover:text-foreground min-w-0 max-w-full"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={candidate.email}>{candidate.email}</span>
              </a>
            )}
            {candidate.telephone && (
              <span className="flex items-center gap-1 min-w-0">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{formatPhone(candidate.telephone)}</span>
              </span>
            )}
            {(profileCity || profileCountry || candidate.pays) && (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {[profileCity, profileCountry].filter(Boolean).join(', ') || candidate.pays}
                </span>
              </span>
            )}
            {candidate.linkedinUrl && (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" /> LinkedIn
              </a>
            )}
            {candidate.githubUrl && (
              <a
                href={candidate.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Github className="h-3.5 w-3.5 shrink-0" /> GitHub
              </a>
            )}
          </div>

          {/* Top skills — only when the candidate has ratings or AI suggestions.
              Keep the chip visual identity from the kanban pipeline row (tight,
              bordered, no pastel). */}
          {!compact && topSkills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topSkills.map(s => (
                <Badge
                  key={s.skillId}
                  variant="secondary"
                  className="text-[10px] font-normal border bg-muted/40"
                >
                  {s.skillLabel} <span className="ml-1 text-foreground font-semibold">L{s.rating}</span>
                </Badge>
              ))}
            </div>
          )}

          {/* Meta strip — canal · candidatures count · expire date. */}
          {!compact && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {candidate.canal && <>Canal : {candidate.canal} · </>}
              Créé {formatDateHuman(candidate.createdAt)} ·{' '}
              <span className={expired ? 'text-rose-500' : ''}>
                {expired ? 'Lien expiré' : `Expire ${formatDateHuman(candidate.expiresAt)}`}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
