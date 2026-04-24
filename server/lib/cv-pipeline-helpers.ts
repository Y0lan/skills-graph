import type { AiProfile } from './profile-schema.js'

/**
 * Detect a profile where the LLM effectively returned nothing usable.
 *
 * Returns true when ALL of the following are empty/null: fullName, summary,
 * current role, current company, contact email, contact phone, AND all
 * array collections (experience, education, languages). A thin-but-legit
 * CV (student with one language + a degree but no experience yet) will NOT
 * trip this — we require every signal to be absent.
 *
 * Why this matters: the category scoring step can report "0 catégories ont
 * échoué" because the skills extractor handled a blank CV gracefully, but
 * the profile extractor silently returned a mostly-null JSON. Without this
 * check, the run would land in `succeeded` and the recruiter would see an
 * empty profile card with no retry affordance.
 *
 * Field names match the real Zod shape in profile-schema.ts — codex
 * challenge rev 1 caught my initial `summary`/`currentRole` flat-field
 * assumption which wouldn't have matched anything.
 */
export function isProfileDegraded(profile: AiProfile): boolean {
  return (
    !profile.identity.fullName.value &&
    !profile.softSignals.summaryFr.value &&
    !profile.currentRole.role.value &&
    !profile.currentRole.company.value &&
    !profile.contact.email.value &&
    !profile.contact.phone.value &&
    profile.experience.length === 0 &&
    profile.education.length === 0 &&
    profile.languages.length === 0
  )
}

export interface ExtractionErrorContext {
  /** Profile extractor threw or returned null */
  profileFailed: boolean
  /** Profile JSON was parsed OK but came back effectively empty */
  profileDegraded: boolean
  /** Exception message from profile extractor, if any */
  profileThrewMsg: string | null
  /** Count of skill categories that failed */
  failedCategories: number
  /** Count of candidatures where the role-aware pass threw */
  roleAwareFailures: number
  /** Count of candidatures whose scoring step threw */
  failedCandidatures: number
}

/**
 * Build a reason-specific `last_extraction_error` string. Replaces the
 * single catch-all "Extraction partielle : 0 catégorie(s) ont échoué"
 * message that previously fired even when the real failure was a silently
 * degraded profile (codex challenge rev 1 finding #5).
 *
 * Returns null when every signal is clean.
 */
export function buildExtractionError(ctx: ExtractionErrorContext): string | null {
  const reasons: string[] = []

  if (ctx.profileFailed && ctx.profileThrewMsg) {
    reasons.push(`extraction du profil échouée : ${ctx.profileThrewMsg}`)
  } else if (ctx.profileFailed) {
    reasons.push('extraction du profil échouée')
  } else if (ctx.profileDegraded) {
    reasons.push('extraction du profil dégradée (retour quasi vide)')
  }

  if (ctx.failedCategories > 0) {
    reasons.push(`${ctx.failedCategories} catégorie(s) de compétences en échec`)
  }
  if (ctx.roleAwareFailures > 0) {
    reasons.push(`extraction orientée rôle échouée sur ${ctx.roleAwareFailures} candidature(s)`)
  }
  if (ctx.failedCandidatures > 0) {
    reasons.push(`scoring échoué pour ${ctx.failedCandidatures} candidature(s)`)
  }

  return reasons.length > 0 ? reasons.join(' | ') : null
}
