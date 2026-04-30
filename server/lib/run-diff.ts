/**
 * Typed diff between two cv_extraction_runs payloads. Used by Phase 8's
 * history dialog to render "what changed between this run and that run".
 *
 * We intentionally DON'T use the `diff` npm package — our objects have
 * known shapes (suggestions: Record<string,number>, profile: AiProfile)
 * so a custom function produces typed, presentation-ready output.
 */
export interface SuggestionsDiff {
    added: Array<{
        skillId: string;
        rating: number;
    }>;
    removed: Array<{
        skillId: string;
        rating: number;
    }>;
    changed: Array<{
        skillId: string;
        from: number;
        to: number;
    }>;
    unchanged: number; // count only, to show "X skills unchanged" without bloating the payload
}
export function diffSuggestions(a: Record<string, number> | null | undefined, b: Record<string, number> | null | undefined): SuggestionsDiff {
    const left = a ?? {};
    const right = b ?? {};
    const added: SuggestionsDiff['added'] = [];
    const removed: SuggestionsDiff['removed'] = [];
    const changed: SuggestionsDiff['changed'] = [];
    let unchanged = 0;
    for (const [skillId, rating] of Object.entries(right)) {
        if (!(skillId in left)) {
            added.push({ skillId, rating });
        }
        else if (left[skillId] !== rating) {
            changed.push({ skillId, from: left[skillId], to: rating });
        }
        else {
            unchanged++;
        }
    }
    for (const [skillId, rating] of Object.entries(left)) {
        if (!(skillId in right)) {
            removed.push({ skillId, rating });
        }
    }
    // Stable ordering for UI
    added.sort((x, y) => x.skillId.localeCompare(y.skillId));
    removed.sort((x, y) => x.skillId.localeCompare(y.skillId));
    changed.sort((x, y) => x.skillId.localeCompare(y.skillId));
    return { added, removed, changed, unchanged };
}
/**
 * Shallow profile diff: for each leaf ProfileField, compute whether value
 * changed. Arrays get coarse length-based diff (added N / removed M) —
 * recruiter can drill into a single run's payload for detail.
 */
export interface ProfileDiff {
    fieldChanges: Array<{
        path: string;
        from: unknown;
        to: unknown;
    }>;
    arrayLengthChanges: Array<{
        path: string;
        from: number;
        to: number;
    }>;
}
export function diffProfile(a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined): ProfileDiff {
    const left = a ?? {};
    const right = b ?? {};
    const fieldChanges: ProfileDiff['fieldChanges'] = [];
    const arrayLengthChanges: ProfileDiff['arrayLengthChanges'] = [];
    function walk(l: unknown, r: unknown, basePath: string) {
        if (isProfileField(l) && !isProfileField(r)) {
            fieldChanges.push({ path: basePath, from: (l as { value: unknown }).value, to: undefined });
            return;
        }
        if (!isProfileField(l) && isProfileField(r)) {
            fieldChanges.push({ path: basePath, from: undefined, to: (r as { value: unknown }).value });
            return;
        }
        if (isProfileField(l) && isProfileField(r)) {
            const lv = (l as {
                value: unknown;
            }).value;
            const rv = (r as {
                value: unknown;
            }).value;
            if (!deepEqual(lv, rv))
                fieldChanges.push({ path: basePath, from: lv, to: rv });
            return;
        }
        if (Array.isArray(l) && !Array.isArray(r)) {
            arrayLengthChanges.push({ path: basePath, from: l.length, to: 0 });
            return;
        }
        if (!Array.isArray(l) && Array.isArray(r)) {
            arrayLengthChanges.push({ path: basePath, from: 0, to: r.length });
            return;
        }
        if (Array.isArray(l) && Array.isArray(r)) {
            if (l.length !== r.length) {
                arrayLengthChanges.push({ path: basePath, from: l.length, to: r.length });
            }
            return;
        }
        if (l && typeof l === 'object' && (!r || typeof r !== 'object')) {
            for (const k of Object.keys(l)) {
                walk((l as Record<string, unknown>)[k], undefined, basePath ? `${basePath}.${k}` : k);
            }
            return;
        }
        if (r && typeof r === 'object' && (!l || typeof l !== 'object')) {
            for (const k of Object.keys(r)) {
                walk(undefined, (r as Record<string, unknown>)[k], basePath ? `${basePath}.${k}` : k);
            }
            return;
        }
        if (l && r && typeof l === 'object' && typeof r === 'object') {
            const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
            for (const k of keys) {
                walk((l as Record<string, unknown>)[k], (r as Record<string, unknown>)[k], basePath ? `${basePath}.${k}` : k);
            }
            return;
        }
        if (!deepEqual(l, r)) {
            fieldChanges.push({ path: basePath, from: l, to: r });
        }
    }
    walk(left, right, '');
    fieldChanges.sort((x, y) => x.path.localeCompare(y.path));
    arrayLengthChanges.sort((x, y) => x.path.localeCompare(y.path));
    return { fieldChanges, arrayLengthChanges };
}
function isProfileField(v: unknown): boolean {
    return !!(v && typeof v === 'object' && !Array.isArray(v)
        && 'value' in (v as Record<string, unknown>)
        && 'humanLockedAt' in (v as Record<string, unknown>));
}
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b)
        return true;
    if (a == null || b == null)
        return a === b;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== 'object')
        return a === b;
    if (Array.isArray(a) !== Array.isArray(b))
        return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        return a.every((x, i) => deepEqual(x, b[i]));
    }
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length)
        return false;
    return ak.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
