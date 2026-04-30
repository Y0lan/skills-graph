// ─── State machine ──────────────────────────────────────────────────
export const TRANSITION_MAP: Record<string, string[]> = {
    postule: ['preselectionne', 'refuse'],
    preselectionne: ['skill_radar_envoye', 'entretien_1', 'refuse'],
    skill_radar_envoye: ['skill_radar_complete', 'refuse'],
    skill_radar_complete: ['entretien_1', 'refuse'],
    entretien_1: ['aboro', 'entretien_2', 'refuse'],
    aboro: ['entretien_2', 'refuse'],
    entretien_2: ['proposition', 'refuse'],
    proposition: ['embauche', 'refuse'],
    embauche: [],
    refuse: [],
};
// Steps that can be skipped (with a logged reason)
export const SKIPPABLE_STEPS = new Set(['aboro', 'entretien_2', 'skill_radar_envoye']);
// Notes required for these transitions
export const NOTES_REQUIRED = new Set(['refuse', 'embauche']);
export function getAllowedTransitions(currentStatut: string): string[] {
    return TRANSITION_MAP[currentStatut] ?? [];
}
export function isSkipTransition(from: string, to: string): boolean {
    const directAllowed = TRANSITION_MAP[from] ?? [];
    if (directAllowed.includes(to))
        return false;
    // Check if we're skipping intermediate steps
    const allStatuts = Object.keys(TRANSITION_MAP);
    const fromIdx = allStatuts.indexOf(from);
    const toIdx = allStatuts.indexOf(to);
    if (toIdx <= fromIdx || to === 'refuse')
        return false;
    // Find skipped steps between from and to
    for (let i = fromIdx + 1; i < toIdx; i++) {
        if (!SKIPPABLE_STEPS.has(allStatuts[i]))
            return false;
    }
    return true;
}
export function getSkippedSteps(from: string, to: string): string[] {
    const allStatuts = Object.keys(TRANSITION_MAP);
    const fromIdx = allStatuts.indexOf(from);
    const toIdx = allStatuts.indexOf(to);
    const skipped: string[] = [];
    for (let i = fromIdx + 1; i < toIdx; i++) {
        skipped.push(allStatuts[i]);
    }
    return skipped;
}
