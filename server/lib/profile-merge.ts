import { getDb } from './db.js';
import { emptyProfile, type AiProfile, type ProfileField } from './profile-schema.js';
const AI_PROFILE_CAS_CONFLICT = 'AI_PROFILE_CAS_CONFLICT';
const AI_PROFILE_MAX_RETRIES = 5;
function isAiProfileCasConflict(err: unknown): boolean {
    return err instanceof Error && err.message === AI_PROFILE_CAS_CONFLICT;
}
function profileRetryDelay(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
}
/**
 * Hydrate a possibly-partial stored `ai_profile` against the full schema.
 * Legacy rows written by older extraction passes can contain only an
 * `identity` block with nothing else populated (real example: stuck
 * candidates with only `{identity: {photoAssetId: …}}`). Merging directly
 * from such a row crashes because `mergeFieldGroup` dereferences
 * `existing.contact.email` on `existing.contact === undefined`. Filling
 * missing sub-objects from `emptyProfile()` keeps the merge contract
 * simple without changing semantics — empty ProfileFields merge as "no
 * value", same as if the sub-object had been there with every field null.
 */
function hydrateAiProfile(raw: Partial<AiProfile> | null): AiProfile {
    const empty = emptyProfile();
    if (!raw)
        return empty;
    return {
        ...empty,
        ...raw,
        identity: { ...empty.identity, ...(raw.identity ?? {}) },
        contact: { ...empty.contact, ...(raw.contact ?? {}) },
        location: { ...empty.location, ...(raw.location ?? {}) },
        currentRole: { ...empty.currentRole, ...(raw.currentRole ?? {}) },
        availability: { ...empty.availability, ...(raw.availability ?? {}) },
        softSignals: { ...empty.softSignals, ...(raw.softSignals ?? {}) },
        openSource: { ...empty.openSource, ...(raw.openSource ?? {}) },
        totalExperienceYears: raw.totalExperienceYears ?? empty.totalExperienceYears,
        education: raw.education ?? empty.education,
        experience: raw.experience ?? empty.experience,
        languages: raw.languages ?? empty.languages,
        certifications: raw.certifications ?? empty.certifications,
        publications: raw.publications ?? empty.publications,
        additionalFacts: raw.additionalFacts ?? empty.additionalFacts,
    };
}
/**
 * Merge a newly-extracted profile into the candidate's stored profile.
 *
 * Semantics (per eng-review decisions, v4 plan):
 *   - Locked fields (humanLockedAt set) are NEVER overwritten.
 *   - Unlocked fields: latest wins. If the new extraction returned null
 *     for a field, the prior value is preserved — LLMs omit data they
 *     don't see, but that doesn't mean "the data disappeared."
 *   - Provenance (runId, sourceDoc, confidence) follows the value. If
 *     the new run produced a value, new provenance is recorded. If the
 *     new run didn't touch the field, prior provenance stays.
 *   - Arrays (education, experience, languages, certifications, publications,
 *     additionalFacts, notableProjects) are REPLACED wholesale when the
 *     new extraction returned any entries. This is simpler than per-entry
 *     merge and matches how the LLM thinks about these: it re-outputs the
 *     complete list from the CV each run.
 *
 * Why the merge function doesn't do SQL writes: it builds the merged
 * AiProfile and returns it. Persistence happens separately through
 * persistMergedProfile, which uses an UPDATE ... WHERE humanLockedAt IS NULL
 * guard per-field so a concurrent lock-click never gets clobbered.
 */
export interface MergeOptions {
    runId: string;
}
export function mergeProfiles(existing: AiProfile | null, incoming: AiProfile, opts: MergeOptions): AiProfile {
    const base = existing ?? emptyProfile();
    const merged: AiProfile = emptyProfile();
    // Top-level objects with ProfileField children
    mergeFieldGroup(merged.identity, base.identity, incoming.identity, opts);
    mergeFieldGroup(merged.contact, base.contact, incoming.contact, opts);
    mergeFieldGroup(merged.location, base.location, incoming.location, opts);
    mergeFieldGroup(merged.currentRole, base.currentRole, incoming.currentRole, opts);
    mergeFieldGroup(merged.availability, base.availability, incoming.availability, opts);
    mergeFieldGroup(merged.softSignals, base.softSignals, incoming.softSignals, opts);
    merged.totalExperienceYears = mergeField(base.totalExperienceYears, incoming.totalExperienceYears, opts);
    merged.openSource.githubUsername = mergeField(base.openSource.githubUsername, incoming.openSource.githubUsername, opts);
    // Arrays: replace when incoming has entries; preserve prior otherwise.
    merged.education = incoming.education.length > 0 ? incoming.education : base.education;
    merged.experience = incoming.experience.length > 0 ? incoming.experience : base.experience;
    merged.languages = incoming.languages.length > 0 ? incoming.languages : base.languages;
    merged.certifications = incoming.certifications.length > 0 ? incoming.certifications : base.certifications;
    merged.publications = incoming.publications.length > 0 ? incoming.publications : base.publications;
    merged.openSource.notableProjects = incoming.openSource.notableProjects.length > 0
        ? incoming.openSource.notableProjects
        : base.openSource.notableProjects;
    merged.additionalFacts = incoming.additionalFacts.length > 0 ? incoming.additionalFacts : base.additionalFacts;
    return merged;
}
/**
 * Merge every ProfileField in a sub-object (identity, contact, etc).
 * Mutates `target` in-place.
 */
function mergeFieldGroup<T extends Record<string, ProfileField<unknown>>>(target: T, base: T, incoming: T, opts: MergeOptions): void {
    for (const key of Object.keys(target) as Array<keyof T>) {
        (target[key] as ProfileField<unknown>) = mergeField(base[key], incoming[key], opts);
    }
}
/**
 * Per-field merge logic. The pure JS version of the lock rule.
 * SQL-level enforcement happens in persistMergedProfile (next function).
 */
function mergeField<T>(base: ProfileField<T>, incoming: ProfileField<T>, opts: MergeOptions): ProfileField<T> {
    // Locked: keep base as-is.
    if (base.humanLockedAt)
        return base;
    // New extraction had no value → preserve base (latest-wins only applies when new IS present)
    if (incoming.value === null || incoming.value === undefined)
        return base;
    // Latest-wins with fresh provenance
    return {
        value: incoming.value,
        runId: opts.runId,
        sourceDoc: incoming.sourceDoc ?? 'cv',
        confidence: incoming.confidence,
        humanLockedAt: null,
        humanLockedBy: null,
    };
}
/**
 * Persist a merged profile with SQL-level lock protection.
 *
 * The merge function already honored locks at JS level, but if a recruiter
 * clicks the lock button BETWEEN the read-merge and write steps, we'd
 * overwrite their brand-new lock. This function re-checks at SQL level:
 * for every ProfileField, the UPDATE only applies if humanLockedAt is still
 * null in the DB. On conflict, we preserve whatever's in the DB.
 *
 * Since ai_profile is stored as a single JSON blob, we can't do field-level
 * SQL locks directly. Instead, we re-read the current profile inside a
 * transaction, apply the merge rule again (field-by-field, respecting locks
 * as they stood at read time), and write. CAS: the UPDATE also checks the
 * candidate row hasn't been concurrently modified.
 */
export async function persistMergedProfile(candidateId: string, incoming: AiProfile, runId: string): Promise<AiProfile> {
    const db = getDb();
    for (let attempt = 0; attempt < AI_PROFILE_MAX_RETRIES; attempt++) {
        // Transaction so the read-merge-write is atomic against concurrent
        // lock/unlock writes going through setProfileFieldLock below.
        const tx = db.transaction(async (): Promise<AiProfile> => {
            const row = await db.prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(candidateId) as {
                ai_profile: string | null;
            } | undefined;
            const originalProfile = row?.ai_profile ?? null;
            const existing: AiProfile | null = originalProfile
                ? stripLegacyPhotoAssetId(hydrateAiProfile(JSON.parse(originalProfile) as Partial<AiProfile>))
                : null;
            const merged = mergeProfiles(existing, stripLegacyPhotoAssetId(hydrateAiProfile(incoming)), { runId });
            const result = await db.prepare(`
                UPDATE candidates
                SET ai_profile = ?
                WHERE id = ? AND ai_profile IS NOT DISTINCT FROM ?
            `).run(JSON.stringify(merged), candidateId, originalProfile);
            if (result.changes === 0)
                throw new Error(AI_PROFILE_CAS_CONFLICT);
            return merged;
        });
        try {
            return await tx();
        }
        catch (err) {
            if (!isAiProfileCasConflict(err) || attempt === AI_PROFILE_MAX_RETRIES - 1)
                throw err;
            await profileRetryDelay(attempt);
        }
    }
    throw new Error(AI_PROFILE_CAS_CONFLICT);
}
/**
 * Strip the legacy `identity.photoAssetId` key. The auto photo extractor
 * is gone (CLAUDE.md CV Intelligence rule #3 — GDPR + non-functional in
 * practice) but older ai_profile rows still carry the key. Lazy cleanup
 * on the next merge write is cheaper than a boot-time scan over every
 * profile (codex challenge rev 1 finding #9). Idempotent.
 */
function stripLegacyPhotoAssetId(profile: AiProfile): AiProfile {
    const identity = profile.identity as Record<string, unknown> | undefined;
    if (identity && 'photoAssetId' in identity) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { photoAssetId, ...rest } = identity;
        return { ...profile, identity: rest as AiProfile['identity'] };
    }
    return profile;
}
/**
 * Toggle a lock on a specific ProfileField within ai_profile. The field
 * is addressed by a dotted path like "contact.phone" or "identity.fullName".
 * Path must resolve to a ProfileField<T>, not a bare value or array.
 *
 * SQL-level race protection: the whole set happens inside one transaction,
 * so a concurrent extraction merge (via persistMergedProfile) either sees
 * the lock state BEFORE our toggle or AFTER it, never a torn in-between
 * state.
 */
export async function setProfileFieldLock(params: {
    candidateId: string;
    fieldPath: string;
    locked: boolean;
    userSlug: string | null;
}): Promise<{
    ok: boolean;
    notFound?: boolean;
    error?: string;
}> {
    const db = getDb();
    for (let attempt = 0; attempt < AI_PROFILE_MAX_RETRIES; attempt++) {
        const tx = db.transaction(async (): Promise<{
            ok: boolean;
            notFound?: boolean;
            error?: string;
        }> => {
            const row = await db.prepare('SELECT ai_profile FROM candidates WHERE id = ?').get(params.candidateId) as {
                ai_profile: string | null;
            } | undefined;
            if (!row)
                return { ok: false, notFound: true };
            const originalProfile = row.ai_profile ?? null;
            const profile: AiProfile = originalProfile ? JSON.parse(originalProfile) : emptyProfile();
            const parts = params.fieldPath.split('.');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let cursor: any = profile;
            for (const p of parts) {
                if (cursor == null || typeof cursor !== 'object')
                    return { ok: false, error: 'bad-path' };
                cursor = cursor[p];
            }
            if (!cursor || typeof cursor !== 'object' || !('humanLockedAt' in cursor)) {
                return { ok: false, error: 'not-a-profile-field' };
            }
            const field = cursor as ProfileField<unknown>;
            if (params.locked) {
                field.humanLockedAt = new Date().toISOString();
                field.humanLockedBy = params.userSlug;
            }
            else {
                field.humanLockedAt = null;
                field.humanLockedBy = null;
            }
            const result = await db.prepare(`
                UPDATE candidates
                SET ai_profile = ?
                WHERE id = ? AND ai_profile IS NOT DISTINCT FROM ?
            `).run(JSON.stringify(profile), params.candidateId, originalProfile);
            if (result.changes === 0)
                throw new Error(AI_PROFILE_CAS_CONFLICT);
            return { ok: true };
        });
        try {
            return await tx();
        }
        catch (err) {
            if (!isAiProfileCasConflict(err))
                throw err;
            if (attempt === AI_PROFILE_MAX_RETRIES - 1)
                return { ok: false, error: 'conflict' };
            await profileRetryDelay(attempt);
        }
    }
    return { ok: false, error: 'conflict' };
}
