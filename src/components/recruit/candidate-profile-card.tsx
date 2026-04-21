import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import {
  User, Mail, Phone, MapPin, GraduationCap, Briefcase, Languages, Award,
  BookOpen, Github, Linkedin, Globe, Calendar, Heart,
} from 'lucide-react'
import FieldProvenanceTooltip, { type ProfileField } from './field-provenance-tooltip'
import InitialsBadge from '@/components/ui/initials-badge'
import SkillPill from './skill-pill'
import ExperienceTimeline, { type TimelineEntry } from './experience-timeline'

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
  /** Optional pre-resolved photo URL. Falls back to initials when null/missing. */
  photoUrl?: string | null
  /** Pre-ranked top skills from caller (role-aware if present, else baseline). Capped at 5. */
  topSkills?: Array<{ skillId: string; skillLabel: string; rating: number }>
}

/**
 * LinkedIn-style candidate profile surface. Hero on top, two-column main +
 * sidebar beneath. Sidebar cards hide entirely when empty — no "Non
 * renseigné" placeholders. "Autres infos" is the only accordion, kept for
 * edge-case facts recruiters rarely need.
 */
export default function CandidateProfileCard({
  candidateId,
  profile: initialProfile,
  photoUrl,
  topSkills = [],
}: CandidateProfileCardProps) {
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

  /** Label: value + lock button row, compact form for sidebar cards. */
  const sidebarRow = (
    label: string,
    path: string,
    field: ProfileField<unknown>,
    render?: (v: unknown) => string,
  ) => {
    if (field.value === null || field.value === undefined || field.value === '') return null
    const display = render ? render(field.value) : String(field.value)
    return (
      <div className="flex items-start justify-between gap-2 py-0.5 text-sm">
        <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
        <span className="flex-1 min-w-0 flex items-start justify-end gap-1">
          <span className="text-right break-words">{display}</span>
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

  // ── Hero values ──
  const name = profile.identity.fullName.value
  const role = profile.currentRole.role.value
  const company = profile.currentRole.company.value
  const startedAt = profile.currentRole.startedAt.value
  const isCurrent = profile.currentRole.isCurrentlyEmployed.value
  const totalExp = profile.totalExperienceYears.value

  const city = profile.location.city.value
  const country = profile.location.country.value
  const locationLabel = [city, country].filter(Boolean).join(', ')
  const remote = profile.location.remotePreference.value
  const license = profile.location.drivingLicense.value
  const willingToRelocate = profile.location.willingToRelocate.value

  const email = profile.contact.email.value
  const phone = profile.contact.phone.value
  const linkedin = profile.contact.linkedinUrl.value
  const github = profile.contact.githubUrl.value
  const portfolio = profile.contact.portfolioUrl.value

  const hasHeaderChips = locationLabel || remote || license || willingToRelocate != null
  const hasContactRow = email || phone || linkedin || github || portfolio

  // ── Sidebar card visibility ──
  const hasContactCard = hasContactRow || (profile.contact.otherLinks.value?.length ?? 0) > 0
  const hasLocationCard =
    city || country || remote || license || willingToRelocate != null
  const hasAvailability =
    profile.availability.noticePeriodDays.value != null || profile.availability.earliestStart.value
  const hasSignaux =
    profile.softSignals.summaryFr.value ||
    (profile.softSignals.motivations.value?.length ?? 0) > 0 ||
    (profile.softSignals.interests.value?.length ?? 0) > 0 ||
    (profile.softSignals.valuesMentioned.value?.length ?? 0) > 0

  // ── Timeline entries ──
  const expEntries: TimelineEntry[] = profile.experience.map(exp => ({
    primary: exp.company,
    secondary: exp.role,
    dateRange: exp.start || exp.end
      ? `${exp.start ?? '—'} → ${exp.end ?? 'présent'}`
      : null,
    location: exp.location,
    description: exp.description,
    tags: exp.technologies,
  }))

  const eduEntries: TimelineEntry[] = profile.education.map(ed => ({
    primary: ed.school,
    secondary: ed.degree ? `${ed.degree}${ed.field ? ' · ' + ed.field : ''}` : ed.field,
    dateRange: ed.yearStart || ed.yearEnd
      ? `${ed.yearStart ?? ''}${ed.yearStart && ed.yearEnd ? '–' : ''}${ed.yearEnd ?? ''}`
      : null,
    location: null,
    description: ed.honors,
    tags: [],
  }))

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 space-y-5">
        {/* ── HERO ── */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 pb-5 border-b">
          <InitialsBadge name={name} photoUrl={photoUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h1 className="text-2xl font-bold leading-tight break-words">
                {name ?? 'Candidat'}
              </h1>
              {totalExp != null ? (
                <Badge variant="outline" className="text-[11px] font-normal shrink-0">
                  {totalExp} ans d&apos;exp.
                </Badge>
              ) : null}
            </div>
            {role || company ? (
              <p className="text-sm text-muted-foreground mt-0.5">
                {role ? role : ''}
                {role && company ? ' · ' : ''}
                {company ? `@ ${company}` : ''}
                {startedAt && isCurrent !== false ? ` · depuis ${startedAt}` : ''}
              </p>
            ) : null}

            {hasContactRow ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {email ? (
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-1 hover:text-foreground min-w-0"
                    aria-label="Email"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate max-w-[180px]">{email}</span>
                  </a>
                ) : null}
                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    aria-label="Téléphone"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" />{phone}
                  </a>
                ) : null}
                {linkedin ? (
                  <a
                    href={linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    aria-label="LinkedIn"
                  >
                    <Linkedin className="h-3.5 w-3.5 shrink-0" />LinkedIn
                  </a>
                ) : null}
                {github ? (
                  <a
                    href={github}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    aria-label="GitHub"
                  >
                    <Github className="h-3.5 w-3.5 shrink-0" />GitHub
                  </a>
                ) : null}
                {portfolio ? (
                  <a
                    href={portfolio}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    aria-label="Portfolio"
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0" />Site
                  </a>
                ) : null}
              </div>
            ) : null}

            {hasHeaderChips ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {locationLabel ? (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-normal inline-flex items-center gap-1"
                  >
                    <MapPin className="h-3 w-3" />{locationLabel}
                  </Badge>
                ) : null}
                {remote ? (
                  <Badge variant="outline" className="text-[11px] font-normal">{remote}</Badge>
                ) : null}
                {license ? (
                  <Badge variant="outline" className="text-[11px] font-normal">Permis {license}</Badge>
                ) : null}
                {willingToRelocate != null ? (
                  <Badge variant="outline" className="text-[11px] font-normal">
                    Mobile : {willingToRelocate ? 'oui' : 'non'}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* ── TOP SKILLS STRIP ── */}
        {topSkills.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap pb-1">
            <span className="text-xs font-medium uppercase text-muted-foreground shrink-0">
              Top compétences
            </span>
            {topSkills.slice(0, 5).map(s => (
              <SkillPill
                key={s.skillId}
                skillId={s.skillId}
                skillLabel={s.skillLabel}
                rating={s.rating}
              />
            ))}
          </div>
        ) : null}

        {/* ── MAIN + SIDEBAR ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-5">
            {expEntries.length > 0 ? (
              <section>
                <h2 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  Expérience ({expEntries.length})
                </h2>
                <ExperienceTimeline entries={expEntries} />
              </section>
            ) : null}

            {eduEntries.length > 0 ? (
              <section>
                <h2 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Formation ({eduEntries.length})
                </h2>
                <ExperienceTimeline entries={eduEntries} />
              </section>
            ) : null}

            {hasSignaux ? (
              <section>
                <h2 className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5" />
                  Signaux
                </h2>
                <div className="space-y-2">
                  {profile.softSignals.summaryFr.value ? (
                    <p className="text-sm whitespace-pre-wrap">{profile.softSignals.summaryFr.value}</p>
                  ) : null}
                  {(profile.softSignals.motivations.value?.length ?? 0) > 0 ? (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Motivations</div>
                      <div className="flex flex-wrap gap-1">
                        {profile.softSignals.motivations.value?.map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] font-normal">{m}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {(profile.softSignals.interests.value?.length ?? 0) > 0 ? (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Intérêts</div>
                      <div className="flex flex-wrap gap-1">
                        {profile.softSignals.interests.value?.map((m, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-normal">{m}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {(profile.softSignals.valuesMentioned.value?.length ?? 0) > 0 ? (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Valeurs</div>
                      <div className="flex flex-wrap gap-1">
                        {profile.softSignals.valuesMentioned.value?.map((m, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-normal">{m}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            {hasContactCard ? (
              <SidebarCard icon={<Mail className="h-3.5 w-3.5" />} title="Contact">
                {sidebarRow('Email', 'contact.email', profile.contact.email)}
                {sidebarRow('Téléphone', 'contact.phone', profile.contact.phone)}
                {sidebarRow('LinkedIn', 'contact.linkedinUrl', profile.contact.linkedinUrl)}
                {sidebarRow('GitHub', 'contact.githubUrl', profile.contact.githubUrl)}
                {sidebarRow('Portfolio', 'contact.portfolioUrl', profile.contact.portfolioUrl)}
                {(profile.contact.otherLinks.value?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(profile.contact.otherLinks.value ?? []).map((u, i) => (
                      <a
                        key={i}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] underline break-all text-muted-foreground hover:text-foreground"
                      >
                        {u}
                      </a>
                    ))}
                  </div>
                ) : null}
              </SidebarCard>
            ) : null}

            {hasLocationCard ? (
              <SidebarCard icon={<MapPin className="h-3.5 w-3.5" />} title="Localisation">
                {sidebarRow('Ville', 'location.city', profile.location.city)}
                {sidebarRow('Pays', 'location.country', profile.location.country)}
                {sidebarRow('Télétravail', 'location.remotePreference', profile.location.remotePreference)}
                {sidebarRow(
                  'Mobile',
                  'location.willingToRelocate',
                  profile.location.willingToRelocate,
                  v => (v ? 'Oui' : 'Non'),
                )}
                {sidebarRow('Permis', 'location.drivingLicense', profile.location.drivingLicense)}
              </SidebarCard>
            ) : null}

            {profile.languages.length > 0 ? (
              <SidebarCard
                icon={<Languages className="h-3.5 w-3.5" />}
                title={`Langues (${profile.languages.length})`}
              >
                <div className="space-y-1">
                  {profile.languages.map((lang, i) => (
                    <div key={i} className="text-sm flex items-baseline justify-between gap-2">
                      <span>{lang.language}</span>
                      {lang.level || lang.certification ? (
                        <span className="text-xs text-muted-foreground text-right">
                          {lang.level ?? ''}
                          {lang.certification ? ` (${lang.certification})` : ''}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </SidebarCard>
            ) : null}

            {profile.certifications.length > 0 ? (
              <SidebarCard
                icon={<Award className="h-3.5 w-3.5" />}
                title={`Certifications (${profile.certifications.length})`}
              >
                <div className="space-y-1.5">
                  {profile.certifications.map((c, i) => (
                    <div key={i} className="text-sm">
                      <div className="leading-tight">{c.label}</div>
                      {c.issuer || c.year ? (
                        <div className="text-xs text-muted-foreground">
                          {c.issuer ?? ''}
                          {c.issuer && c.year ? ' · ' : ''}
                          {c.year ? `${c.year}` : ''}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </SidebarCard>
            ) : null}

            {hasAvailability ? (
              <SidebarCard icon={<Calendar className="h-3.5 w-3.5" />} title="Disponibilité">
                {sidebarRow(
                  'Préavis',
                  'availability.noticePeriodDays',
                  profile.availability.noticePeriodDays,
                  v => `${v} jours`,
                )}
                {sidebarRow('Début', 'availability.earliestStart', profile.availability.earliestStart)}
              </SidebarCard>
            ) : null}

            {profile.publications.length > 0 ? (
              <SidebarCard
                icon={<BookOpen className="h-3.5 w-3.5" />}
                title={`Publications (${profile.publications.length})`}
              >
                <div className="space-y-1.5">
                  {profile.publications.map((p, i) => (
                    <div key={i} className="text-sm leading-tight">
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="underline">
                          {p.title}
                        </a>
                      ) : (
                        p.title
                      )}
                      {p.venue || p.year ? (
                        <div className="text-xs text-muted-foreground">
                          {p.venue ?? ''}
                          {p.venue && p.year ? ' · ' : ''}
                          {p.year ? `${p.year}` : ''}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </SidebarCard>
            ) : null}

            {profile.openSource.githubUsername.value ||
            profile.openSource.notableProjects.length > 0 ? (
              <SidebarCard icon={<Github className="h-3.5 w-3.5" />} title="Open source">
                {sidebarRow(
                  'GitHub',
                  'openSource.githubUsername',
                  profile.openSource.githubUsername,
                )}
                {profile.openSource.notableProjects.length > 0 ? (
                  <div className="space-y-1 pt-1">
                    {profile.openSource.notableProjects.map((p, i) => (
                      <div key={i} className="text-sm leading-tight">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer" className="font-medium underline">
                            {p.name}
                          </a>
                        ) : (
                          <span className="font-medium">{p.name}</span>
                        )}
                        {p.description ? (
                          <div className="text-xs text-muted-foreground">{p.description}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </SidebarCard>
            ) : null}
          </aside>
        </div>

        {/* ── AUTRES INFOS — accordion fallback ── */}
        {profile.additionalFacts.length > 0 ? (
          <div className="border-t pt-2">
            <Accordion className="w-full">
              <AccordionItem value="additional">
                <AccordionTrigger className="text-sm py-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    Autres infos ({profile.additionalFacts.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-2 space-y-1">
                  {profile.additionalFacts.map((f, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-muted-foreground">{f.label} :</span> {f.value}
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {f.source === 'cv' ? 'CV' : 'Lettre'}
                      </Badge>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SidebarCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border p-3 space-y-1.5">
      <h3 className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <div>{children}</div>
    </div>
  )
}
