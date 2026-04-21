import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { User, Mail, MapPin, GraduationCap, Briefcase, Languages, Award, BookOpen, Github, Calendar, Heart } from 'lucide-react'
import FieldProvenanceTooltip, { type ProfileField } from './field-provenance-tooltip'

interface EducationEntry {
  degree: string | null
  school: string | null
  field: string | null
  yearStart: string | number | null
  yearEnd: string | number | null
  honors: string | null
}

interface ExperienceEntry {
  company: string | null
  role: string | null
  start: string | null
  end: string | null
  durationMonths: number | null
  location: string | null
  description: string | null
  technologies: string[]
}

interface LanguageEntry {
  language: string
  level: string | null
  certification: string | null
}

interface CertificationEntry {
  label: string
  issuer: string | null
  year: string | number | null
  expiresAt: string | null
}

interface PublicationEntry {
  title: string
  venue: string | null
  year: string | number | null
  url: string | null
}

interface OpenSourceProject {
  name: string
  url: string | null
  description: string | null
}

interface AdditionalFact {
  label: string
  value: string
  source: 'cv' | 'lettre'
}

export interface AiProfile {
  identity: { fullName: ProfileField<string> }
  contact: {
    email: ProfileField<string>
    phone: ProfileField<string>
    linkedinUrl: ProfileField<string>
    githubUrl: ProfileField<string>
    portfolioUrl: ProfileField<string>
    otherLinks: ProfileField<string[]>
  }
  location: {
    city: ProfileField<string>
    country: ProfileField<string>
    willingToRelocate: ProfileField<boolean>
    remotePreference: ProfileField<string>
    drivingLicense: ProfileField<string>
  }
  education: EducationEntry[]
  experience: ExperienceEntry[]
  currentRole: {
    company: ProfileField<string>
    role: ProfileField<string>
    isCurrentlyEmployed: ProfileField<boolean>
    startedAt: ProfileField<string>
  }
  totalExperienceYears: ProfileField<number>
  languages: LanguageEntry[]
  certifications: CertificationEntry[]
  publications: PublicationEntry[]
  openSource: { githubUsername: ProfileField<string>; notableProjects: OpenSourceProject[] }
  availability: { noticePeriodDays: ProfileField<number>; earliestStart: ProfileField<string> }
  softSignals: {
    summaryFr: ProfileField<string>
    motivations: ProfileField<string[]>
    interests: ProfileField<string[]>
    valuesMentioned: ProfileField<string[]>
  }
  additionalFacts: AdditionalFact[]
  _schemaVersion?: number
}

export interface CandidateProfileCardProps {
  candidateId: string
  profile: AiProfile | null
}

/**
 * Rendered at the top of the candidate detail page. Each accordion section
 * shows one slice of the extracted profile with per-field lock buttons.
 *
 * When `profile` is null (no extraction yet), the card renders a compact
 * empty state so the layout doesn't jump between states.
 */
export default function CandidateProfileCard({ candidateId, profile: initialProfile }: CandidateProfileCardProps) {
  const [profile, setProfile] = useState<AiProfile | null>(initialProfile)

  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> Profil extrait
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Aucune extraction CV encore effectuée.</p>
        </CardContent>
      </Card>
    )
  }

  const setField = (path: string, next: ProfileField<unknown>) => {
    setProfile(prev => {
      if (!prev) return prev
      const copy = structuredClone(prev) as unknown as Record<string, unknown>
      const parts = path.split('.')
      let cursor: Record<string, unknown> = copy
      for (let i = 0; i < parts.length - 1; i++) {
        cursor = cursor[parts[i]] as Record<string, unknown>
      }
      cursor[parts[parts.length - 1]] = next
      return copy as unknown as AiProfile
    })
  }

  const fieldRow = (label: string, path: string, field: ProfileField<unknown>, render?: (v: unknown) => string) => {
    if (field.value === null || field.value === undefined) return null
    const display = render ? render(field.value) : String(field.value)
    return (
      <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
        <span className="text-muted-foreground shrink-0 min-w-[140px]">{label}</span>
        <span className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="break-words">{display}</span>
          <FieldProvenanceTooltip
            candidateId={candidateId}
            fieldPath={path}
            field={field}
            onChange={(next) => setField(path, next)}
          />
        </span>
      </div>
    )
  }

  const hasContact = profile.contact.email.value || profile.contact.phone.value || profile.contact.linkedinUrl.value || profile.contact.githubUrl.value || profile.contact.portfolioUrl.value
  const hasLocation = profile.location.city.value || profile.location.country.value || profile.location.willingToRelocate.value !== null || profile.location.remotePreference.value
  const hasCurrentRole = profile.currentRole.company.value || profile.currentRole.role.value
  const hasAvailability = profile.availability.noticePeriodDays.value !== null || profile.availability.earliestStart.value
  const hasSoftSignals = profile.softSignals.summaryFr.value || (profile.softSignals.motivations.value?.length ?? 0) > 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Profil extrait
          {profile.identity.fullName.value ? (
            <span className="font-normal text-muted-foreground">— {profile.identity.fullName.value}</span>
          ) : null}
          {profile.totalExperienceYears.value != null ? (
            <Badge variant="outline" className="ml-auto text-[11px]">
              {profile.totalExperienceYears.value} ans d&apos;exp.
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion className="w-full">
          {hasContact ? (
            <AccordionItem value="contact">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Contact</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                {fieldRow('Email', 'contact.email', profile.contact.email)}
                {fieldRow('Téléphone', 'contact.phone', profile.contact.phone)}
                {fieldRow('LinkedIn', 'contact.linkedinUrl', profile.contact.linkedinUrl)}
                {fieldRow('GitHub', 'contact.githubUrl', profile.contact.githubUrl)}
                {fieldRow('Portfolio', 'contact.portfolioUrl', profile.contact.portfolioUrl)}
                {(profile.contact.otherLinks.value?.length ?? 0) > 0 ? (
                  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
                    <span className="text-muted-foreground shrink-0 min-w-[140px]">Autres liens</span>
                    <span className="flex-1 flex flex-wrap gap-1">
                      {(profile.contact.otherLinks.value ?? []).map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" className="text-xs underline break-all">{u}</a>
                      ))}
                    </span>
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {hasLocation ? (
            <AccordionItem value="location">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Localisation</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                {fieldRow('Ville', 'location.city', profile.location.city)}
                {fieldRow('Pays', 'location.country', profile.location.country)}
                {fieldRow('Télétravail', 'location.remotePreference', profile.location.remotePreference)}
                {fieldRow('Mobile', 'location.willingToRelocate', profile.location.willingToRelocate, v => v ? 'Oui' : 'Non')}
                {fieldRow('Permis', 'location.drivingLicense', profile.location.drivingLicense)}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {hasCurrentRole ? (
            <AccordionItem value="currentRole">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5" /> Poste actuel</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                {fieldRow('Entreprise', 'currentRole.company', profile.currentRole.company)}
                {fieldRow('Rôle', 'currentRole.role', profile.currentRole.role)}
                {fieldRow('Depuis', 'currentRole.startedAt', profile.currentRole.startedAt)}
                {fieldRow('En poste', 'currentRole.isCurrentlyEmployed', profile.currentRole.isCurrentlyEmployed, v => v ? 'Oui' : 'Non')}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {profile.experience.length > 0 ? (
            <AccordionItem value="experience">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5" /> Expérience ({profile.experience.length})</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2 space-y-3">
                {profile.experience.map((exp, i) => (
                  <div key={i} className="text-sm border-l-2 border-muted pl-3">
                    <div className="font-medium">{exp.role ?? '—'} {exp.company ? `· ${exp.company}` : ''}</div>
                    <div className="text-xs text-muted-foreground">
                      {exp.start ?? '—'} → {exp.end ?? 'actuel'}{exp.durationMonths ? ` (${Math.floor(exp.durationMonths / 12)} an${exp.durationMonths >= 24 ? 's' : ''})` : ''}
                      {exp.location ? ` · ${exp.location}` : ''}
                    </div>
                    {exp.description ? <div className="text-xs mt-1 whitespace-pre-wrap">{exp.description}</div> : null}
                    {exp.technologies.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {exp.technologies.map((t, j) => (
                          <Badge key={j} variant="outline" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {profile.education.length > 0 ? (
            <AccordionItem value="education">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5" /> Formation ({profile.education.length})</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2 space-y-2">
                {profile.education.map((ed, i) => (
                  <div key={i} className="text-sm border-l-2 border-muted pl-3">
                    <div className="font-medium">{ed.degree ?? '—'}{ed.field ? ` · ${ed.field}` : ''}</div>
                    <div className="text-xs text-muted-foreground">
                      {ed.school ?? '—'}
                      {ed.yearStart || ed.yearEnd ? ` · ${ed.yearStart ?? ''}${ed.yearStart && ed.yearEnd ? '–' : ''}${ed.yearEnd ?? ''}` : ''}
                    </div>
                    {ed.honors ? <div className="text-xs mt-1 italic">{ed.honors}</div> : null}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {profile.languages.length > 0 ? (
            <AccordionItem value="languages">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Languages className="h-3.5 w-3.5" /> Langues ({profile.languages.length})</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((lang, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {lang.language}{lang.level ? ` · ${lang.level}` : ''}{lang.certification ? ` (${lang.certification})` : ''}
                    </Badge>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {profile.certifications.length > 0 ? (
            <AccordionItem value="certifications">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Award className="h-3.5 w-3.5" /> Certifications ({profile.certifications.length})</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2 space-y-1">
                {profile.certifications.map((c, i) => (
                  <div key={i} className="text-sm">
                    {c.label}{c.issuer ? ` · ${c.issuer}` : ''}{c.year ? ` (${c.year})` : ''}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {profile.publications.length > 0 ? (
            <AccordionItem value="publications">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" /> Publications ({profile.publications.length})</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2 space-y-1">
                {profile.publications.map((p, i) => (
                  <div key={i} className="text-sm">
                    {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="underline">{p.title}</a> : p.title}
                    {p.venue ? <span className="text-xs text-muted-foreground"> · {p.venue}</span> : null}
                    {p.year ? <span className="text-xs text-muted-foreground"> ({p.year})</span> : null}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {profile.openSource.githubUsername.value || profile.openSource.notableProjects.length > 0 ? (
            <AccordionItem value="openSource">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Github className="h-3.5 w-3.5" /> Open source</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                {fieldRow('GitHub', 'openSource.githubUsername', profile.openSource.githubUsername)}
                {profile.openSource.notableProjects.map((p, i) => (
                  <div key={i} className="text-sm mt-1">
                    {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="font-medium underline">{p.name}</a> : <span className="font-medium">{p.name}</span>}
                    {p.description ? <div className="text-xs text-muted-foreground">{p.description}</div> : null}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {hasAvailability ? (
            <AccordionItem value="availability">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> Disponibilité</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                {fieldRow('Préavis', 'availability.noticePeriodDays', profile.availability.noticePeriodDays, v => `${v} jours`)}
                {fieldRow('Date de début', 'availability.earliestStart', profile.availability.earliestStart)}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {hasSoftSignals ? (
            <AccordionItem value="signals">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2"><Heart className="h-3.5 w-3.5" /> Signaux (motivations, intérêts)</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2 space-y-2">
                {profile.softSignals.summaryFr.value ? (
                  <div className="text-sm whitespace-pre-wrap">{profile.softSignals.summaryFr.value}</div>
                ) : null}
                {(profile.softSignals.motivations.value?.length ?? 0) > 0 ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Motivations</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.softSignals.motivations.value?.map((m, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{m}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {(profile.softSignals.interests.value?.length ?? 0) > 0 ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Intérêts</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.softSignals.interests.value?.map((m, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{m}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {profile.additionalFacts.length > 0 ? (
            <AccordionItem value="additional">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2">Autres infos ({profile.additionalFacts.length})</span>
              </AccordionTrigger>
              <AccordionContent className="pb-2 space-y-1">
                {profile.additionalFacts.map((f, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-muted-foreground">{f.label}&nbsp;:</span> {f.value}
                    <Badge variant="outline" className="ml-2 text-[10px]">{f.source === 'cv' ? 'CV' : 'Lettre'}</Badge>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </CardContent>
    </Card>
  )
}
