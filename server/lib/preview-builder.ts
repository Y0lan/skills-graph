import { safeJsonParse } from './types.js';
import { mergeEffectiveRatings } from './effective-ratings.js';
/**
 * Preview profile built from CV-extracted `ai_profile` + the
 * candidature\'s effective ratings. Surfaces in the pipeline
 * candidatures list (one row per candidature) so a recruiter can
 * triage at a glance — city, current role, top-3 skills, notice
 * period — without expanding the candidate detail panel.
 *
 * Pre-extraction this lived inline in recruitment.ts (the
 * `/candidatures` GET handler). Lifting it makes the merge
 * contract reusable from any future route that surfaces a
 * candidature row (e.g. the cross-poste comparison report\'s
 * candidate cards). Codex post-plan P1 #4.
 */
export interface PreviewProfile {
    city: string | null;
    country: string | null;
    currentRole: string | null;
    currentCompany: string | null;
    totalExperienceYears: number | null;
    noticePeriodDays: number | null;
    topSkills: Array<{
        skillId: string;
        skillLabel: string;
        rating: number;
    }>;
}
export interface BuildPreviewInput {
    /** `candidates.ai_profile` raw JSON. */
    aiProfileRaw: string | null;
    /** `candidatures.role_aware_suggestions` raw JSON. */
    roleAwareRaw: string | null;
    /** `candidates.ai_suggestions` raw JSON. */
    baselineRaw: string | null;
    /** `candidates.ratings` raw JSON. */
    manualRaw: string | null;
    /** Lookup for skill labels — built once by the caller from a
     *  `SELECT id, label FROM skills` so the helper doesn\'t do per-row
     *  DB hits in a hot loop. */
    skillLabelById: Map<string, string>;
}
export function buildPreview(input: BuildPreviewInput): PreviewProfile | null {
    // Effective Ratings Module — current-poste mode. Was previously an
    // either/or (roleAware OR baseline), which silently dropped both
    // the AI baseline (when role-aware was non-empty) and the
    // candidate\'s manual ratings (always — they weren\'t fetched).
    // The preview\'s topSkills now agrees with the score computed
    // against the candidature.
    const { ratings } = mergeEffectiveRatings({ ai: input.baselineRaw, roleAware: input.roleAwareRaw, manual: input.manualRaw }, 'current-poste');
    const hasAnyProfile = input.aiProfileRaw !== null && input.aiProfileRaw !== '';
    const hasAnyRatings = Object.keys(ratings).length > 0;
    if (!hasAnyProfile && !hasAnyRatings)
        return null;
    const aiProfile = hasAnyProfile ? safeJsonParse<Record<string, unknown>>(input.aiProfileRaw, {}) : {};
    const location = (aiProfile?.location ?? {}) as Record<string, {
        value?: unknown;
    }>;
    const currentRole = (aiProfile?.currentRole ?? {}) as Record<string, {
        value?: unknown;
    }>;
    const availability = (aiProfile?.availability ?? {}) as Record<string, {
        value?: unknown;
    }>;
    const totalExp = (aiProfile?.totalExperienceYears ?? {}) as {
        value?: unknown;
    };
    const topSkills = Object.entries(ratings)
        .filter(([, r]) => typeof r === 'number' && r > 0)
        .map(([skillId, rating]) => ({
        skillId,
        skillLabel: input.skillLabelById.get(skillId) ?? skillId,
        rating: rating as number,
    }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3);
    const asString = (v: unknown): string | null => typeof v === 'string' && v.length > 0 ? v : null;
    const asNumber = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
    return {
        city: asString(location.city?.value),
        country: asString(location.country?.value),
        currentRole: asString(currentRole.role?.value),
        currentCompany: asString(currentRole.company?.value),
        totalExperienceYears: asNumber(totalExp.value),
        noticePeriodDays: asNumber(availability.noticePeriodDays?.value),
        topSkills,
    };
}
