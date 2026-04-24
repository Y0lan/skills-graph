import { z } from 'zod'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

/**
 * Per-field provenance wrapper. Every atomic value the LLM extracts is
 * wrapped in this envelope so the UI can show "extracted from CV on X,
 * confidence Y" tooltips and recruiters can lock verified values.
 */
export interface ProfileField<T> {
  value: T | null
  runId: string | null
  sourceDoc: 'cv' | 'lettre' | 'merged' | 'human' | null
  confidence: number | null
  humanLockedAt: string | null
  humanLockedBy: string | null
}

export function emptyField<T>(): ProfileField<T> {
  return { value: null, runId: null, sourceDoc: null, confidence: null, humanLockedAt: null, humanLockedBy: null }
}

// Operational recruiting fields only per v4 plan. Sensitive fields
// (DOB, gender, nationality, marital status, expected salary, photo)
// are intentionally absent.

export const AiProfileSchemaVersion = 1 as const

const ProfileField = <T extends z.ZodTypeAny>(inner: T) => z.object({
  value: inner.nullable(),
  runId: z.string().nullable(),
  sourceDoc: z.enum(['cv', 'lettre', 'merged', 'human']).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  humanLockedAt: z.string().nullable(),
  humanLockedBy: z.string().nullable(),
})

// Entry schemas use `.nullish()` (accepts string | null | undefined) on
// fields the LLM may silently omit. Empirically the Anthropic model drops
// keys for fields it can't find in the CV (e.g. `experience[*].location`
// when the entry has no location). `.nullable()` alone rejects undefined
// and the whole profile extraction fails Zod parse.
const EducationEntry = z.object({
  degree: z.string().nullish(),
  school: z.string().nullish(),
  field: z.string().nullish(),
  yearStart: z.union([z.string(), z.number()]).nullish(),
  yearEnd: z.union([z.string(), z.number()]).nullish(),
  honors: z.string().nullish(),
})

const ExperienceEntry = z.object({
  company: z.string().nullish(),
  role: z.string().nullish(),
  start: z.string().nullish(),
  end: z.string().nullish(),
  durationMonths: z.number().nullish(),
  location: z.string().nullish(),
  description: z.string().nullish(),
  technologies: z.array(z.string()).default([]),
})

const LanguageEntry = z.object({
  language: z.string(),
  level: z.string().nullish(),
  certification: z.string().nullish(),
})

const CertificationEntry = z.object({
  label: z.string(),
  issuer: z.string().nullish(),
  year: z.union([z.string(), z.number()]).nullish(),
  expiresAt: z.string().nullish(),
})

const PublicationEntry = z.object({
  title: z.string(),
  venue: z.string().nullish(),
  year: z.union([z.string(), z.number()]).nullish(),
  url: z.string().nullish(),
})

const OpenSourceProject = z.object({
  name: z.string(),
  url: z.string().nullish(),
  description: z.string().nullish(),
})

const AdditionalFact = z.object({
  label: z.string(),
  value: z.string(),
  source: z.enum(['cv', 'lettre']),
})

export const AiProfileZ = z.object({
  identity: z.object({
    fullName: ProfileField(z.string()),
    // `photoAssetId` intentionally removed per CLAUDE.md CV Intelligence
    // rule #3 (GDPR + non-functional auto-extraction). Legacy rows that
    // still carry the key are stripped lazily in persistMergedProfile.
  }),
  contact: z.object({
    email: ProfileField(z.string()),
    phone: ProfileField(z.string()),
    linkedinUrl: ProfileField(z.string()),
    githubUrl: ProfileField(z.string()),
    portfolioUrl: ProfileField(z.string()),
    otherLinks: ProfileField(z.array(z.string())),
  }),
  location: z.object({
    city: ProfileField(z.string()),
    country: ProfileField(z.string()),
    willingToRelocate: ProfileField(z.boolean()),
    remotePreference: ProfileField(z.string()),
    drivingLicense: ProfileField(z.string()),
  }),
  education: z.array(EducationEntry).default([]),
  experience: z.array(ExperienceEntry).default([]),
  currentRole: z.object({
    company: ProfileField(z.string()),
    role: ProfileField(z.string()),
    isCurrentlyEmployed: ProfileField(z.boolean()),
    startedAt: ProfileField(z.string()),
  }),
  totalExperienceYears: ProfileField(z.number()),
  languages: z.array(LanguageEntry).default([]),
  certifications: z.array(CertificationEntry).default([]),
  publications: z.array(PublicationEntry).default([]),
  openSource: z.object({
    githubUsername: ProfileField(z.string()),
    notableProjects: z.array(OpenSourceProject).default([]),
  }),
  availability: z.object({
    noticePeriodDays: ProfileField(z.number()),
    earliestStart: ProfileField(z.string()),
  }),
  softSignals: z.object({
    summaryFr: ProfileField(z.string()),
    motivations: ProfileField(z.array(z.string())),
    interests: ProfileField(z.array(z.string())),
    valuesMentioned: ProfileField(z.array(z.string())),
  }),
  additionalFacts: z.array(AdditionalFact).default([]),
  _schemaVersion: z.literal(AiProfileSchemaVersion).default(AiProfileSchemaVersion),
})

export type AiProfile = z.infer<typeof AiProfileZ>

/**
 * Build an empty AiProfile (every field null, every list empty). Used as
 * the starting point for new candidates before any extraction has run.
 */
export function emptyProfile(): AiProfile {
  return {
    identity: { fullName: emptyField() },
    contact: {
      email: emptyField(),
      phone: emptyField(),
      linkedinUrl: emptyField(),
      githubUrl: emptyField(),
      portfolioUrl: emptyField(),
      otherLinks: emptyField(),
    },
    location: {
      city: emptyField(),
      country: emptyField(),
      willingToRelocate: emptyField(),
      remotePreference: emptyField(),
      drivingLicense: emptyField(),
    },
    education: [],
    experience: [],
    currentRole: {
      company: emptyField(),
      role: emptyField(),
      isCurrentlyEmployed: emptyField(),
      startedAt: emptyField(),
    },
    totalExperienceYears: emptyField(),
    languages: [],
    certifications: [],
    publications: [],
    openSource: { githubUsername: emptyField(), notableProjects: [] },
    availability: { noticePeriodDays: emptyField(), earliestStart: emptyField() },
    softSignals: {
      summaryFr: emptyField(),
      motivations: emptyField(),
      interests: emptyField(),
      valuesMentioned: emptyField(),
    },
    additionalFacts: [],
    _schemaVersion: AiProfileSchemaVersion,
  }
}

// ── Normalizers ─────────────────────────────────────────────────────────

/**
 * Normalize a phone number to E.164 if parseable. Return null if the
 * string is unparseable as a phone (LLM hallucinated or formatted weird).
 * Default region is FR since this is a French-market product.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = parsePhoneNumberFromString(raw.trim(), 'FR')
    if (parsed?.isValid()) return parsed.format('E.164')
  } catch {
    // fall through
  }
  return null
}

/**
 * Validate a URL string. Returns the normalized URL (with scheme) or null.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const trimmed = raw.trim()
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const u = new URL(withScheme)
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Normalize an ISO 8601 date or "YYYY-MM-DD" string. Returns the parsed
 * ISO string or null if unparseable. Accepts common French formats too
 * ("15/03/2023") as a best-effort.
 */
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  // Direct ISO
  const iso = new Date(trimmed)
  if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10)
  // DD/MM/YYYY
  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (fr) {
    const [, d, m, y] = fr
    const parsed = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return null
}

/**
 * Post-LLM normalization pass. Mutates fields in-place where we have a
 * normalizer. Leaves non-normalizable fields as-is (Zod validates shape).
 */
export function normalizeProfile(profile: AiProfile): AiProfile {
  if (profile.contact.phone.value) {
    const normalized = normalizePhone(profile.contact.phone.value)
    profile.contact.phone.value = normalized
  }
  for (const key of ['linkedinUrl', 'githubUrl', 'portfolioUrl'] as const) {
    const field = profile.contact[key]
    if (field.value) field.value = normalizeUrl(field.value)
  }
  if (profile.contact.otherLinks.value) {
    profile.contact.otherLinks.value = profile.contact.otherLinks.value
      .map(u => normalizeUrl(u))
      .filter((u): u is string => u !== null)
  }
  for (const entry of profile.experience) {
    if (entry.start) entry.start = normalizeDate(entry.start) ?? entry.start
    if (entry.end) entry.end = normalizeDate(entry.end) ?? entry.end
  }
  if (profile.availability.earliestStart.value) {
    profile.availability.earliestStart.value =
      normalizeDate(profile.availability.earliestStart.value) ?? profile.availability.earliestStart.value
  }
  return profile
}
