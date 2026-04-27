import { AlertTriangle, MapPin, Briefcase, Clock, FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import InitialsBadge from '@/components/ui/initials-badge'
import SkillPill from './skill-pill'

interface PreviewProfile {
  city: string | null
  country: string | null
  currentRole: string | null
  currentCompany: string | null
  totalExperienceYears: number | null
  noticePeriodDays: number | null
  topSkills: Array<{ skillId: string; skillLabel: string; rating: number }>
}

export interface PipelineCandidatureRowProps {
  candidateName: string
  posteTitre: string
  canal: string
  canalLabel: string
  createdAtLabel: string
  hasCv: boolean
  hasLettre: boolean
  evaluationSubmitted: boolean
  softSkillAlertCount: number
  preview: PreviewProfile | null
  /** Extra React nodes rendered after the meta chips (status chip, docs chip) */
  statusChip?: React.ReactNode
  docsChip?: React.ReactNode
  /** v5.1 — derived from a yopmail-style email so test candidatures
   *  the recruiter created to step through the pipeline don't get
   *  visually conflated with real applicants. See
   *  src/lib/test-candidate.ts. */
  isTest?: boolean
}

/**
 * At-a-glance candidature row for /recruit/pipeline. Replaces the old
 * "Nom · canal · date" preview with profile headline and top-3 skills
 * so a recruiter can triage across postes without clicking in.
 */
export default function PipelineCandidatureRow({
  candidateName,
  posteTitre,
  canalLabel,
  createdAtLabel,
  hasCv,
  hasLettre,
  evaluationSubmitted,
  softSkillAlertCount,
  preview,
  statusChip,
  docsChip,
  isTest = false,
}: PipelineCandidatureRowProps) {
  const location = [preview?.city, preview?.country].filter(Boolean).join(', ')
  const roleAtCompany = preview?.currentRole && preview?.currentCompany
    ? `${preview.currentRole} @ ${preview.currentCompany}`
    : (preview?.currentRole ?? preview?.currentCompany ?? null)

  const hasHeadline = location || roleAtCompany || preview?.totalExperienceYears != null
  const hasTopSkills = (preview?.topSkills?.length ?? 0) > 0
  const showFullPreview = hasHeadline || hasTopSkills

  // Graceful fallback when no preview data yet (pre-extraction): keep the
  // single-line legacy layout so the row isn't mostly blank.
  if (!showFullPreview) {
    return (
      <div className="flex items-center gap-3">
        <InitialsBadge name={candidateName} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="hover:underline font-medium text-sm truncate">{candidateName}</span>
            {isTest && (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/60 text-amber-700 bg-amber-500/10 dark:border-amber-400/60 dark:text-amber-300"
                title="Candidature de test (email yopmail)"
              >
                <FlaskConical className="h-2.5 w-2.5 mr-0.5" />
                TEST
              </Badge>
            )}
            {statusChip}
            {docsChip}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{posteTitre}</span>
            <span>·</span>
            <span>{canalLabel}</span>
            <span>·</span>
            <span>{createdAtLabel}</span>
            {hasCv && <Badge variant="outline" className="text-[10px] px-1 py-0">CV</Badge>}
            {hasLettre && <Badge variant="outline" className="text-[10px] px-1 py-0">LM</Badge>}
            {evaluationSubmitted && <Badge variant="outline" className="text-[10px] px-1 py-0">Évalué</Badge>}
            {softSkillAlertCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-red-500 text-red-600 dark:border-red-400 dark:text-red-400">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                Soft skills
              </Badge>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Full preview: two-line richer layout.
  return (
    <div className="flex items-start gap-3">
      <InitialsBadge name={candidateName} size="sm" />
      <div className="flex-1 min-w-0 space-y-1">
        {/* Line 1: name + status + docs + meta */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hover:underline font-medium text-sm truncate">{candidateName}</span>
          {isTest && (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-500/60 text-amber-700 bg-amber-500/10 dark:border-amber-400/60 dark:text-amber-300"
              title="Candidature de test (email yopmail)"
            >
              <FlaskConical className="h-2.5 w-2.5 mr-0.5" />
              TEST
            </Badge>
          )}
          {statusChip}
          {docsChip}
          {softSkillAlertCount > 0 && (
            <Badge variant="outline" className="text-[10px] border-red-500 text-red-600 dark:border-red-400 dark:text-red-400">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              Soft skills
            </Badge>
          )}
        </div>

        {/* Line 2: headline (role/location/exp) */}
        {hasHeadline ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />{location}
              </span>
            ) : null}
            {roleAtCompany ? (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" />{roleAtCompany}
              </span>
            ) : null}
            {preview?.totalExperienceYears != null ? (
              <span>{preview.totalExperienceYears} ans d&apos;exp.</span>
            ) : null}
          </div>
        ) : null}

        {/* Line 3: top skills + notice period */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasTopSkills
            ? preview!.topSkills.slice(0, 3).map(s => (
              <SkillPill
                key={s.skillId}
                skillId={s.skillId}
                skillLabel={s.skillLabel}
                rating={s.rating}
              />
            ))
            : null}
          {preview?.noticePeriodDays != null ? (
            <Badge variant="outline" className="text-[10px] font-normal inline-flex items-center gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <Clock className="h-2.5 w-2.5" />
              préavis {preview.noticePeriodDays}j
            </Badge>
          ) : null}
        </div>

        {/* Line 4: poste meta (smaller, muted) */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80 flex-wrap">
          <span>{posteTitre}</span>
          <span>·</span>
          <span>{canalLabel}</span>
          <span>·</span>
          <span>{createdAtLabel}</span>
          {hasCv && <Badge variant="outline" className="text-[10px] px-1 py-0">CV</Badge>}
          {hasLettre && <Badge variant="outline" className="text-[10px] px-1 py-0">LM</Badge>}
          {evaluationSubmitted && <Badge variant="outline" className="text-[10px] px-1 py-0">Évalué</Badge>}
        </div>
      </div>
    </div>
  )
}
