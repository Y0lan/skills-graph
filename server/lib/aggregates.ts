import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSkillCategories } from './catalog.js';
import { teamMembers } from '../data/team-roster.js';
import { getAllEvaluations, getDb } from './db.js';
import { computeEvaluationProgress, type EvaluationStatus } from './evaluation-progress.js';
import { resolveMemberFormScopes } from './member-form-scope.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGETS_FILE = path.join(__dirname, '..', 'data', 'targets.json');
function readTargets(): Record<string, Record<string, number>> {
    try {
        return JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
// ─── Category average for a single member ────────────────────
// Excludes values <= 0 (N/A or not rated)
function memberCategoryAvg(categoryId: string, ratings: Record<string, number>): {
    avg: number;
    ratedCount: number;
    totalCount: number;
} {
    const skillCategories = getSkillCategories();
    const cat = skillCategories.find((c) => c.id === categoryId);
    if (!cat)
        return { avg: 0, ratedCount: 0, totalCount: 0 };
    const values: number[] = [];
    let ratedCount = 0;
    for (const skill of cat.skills) {
        const val = ratings[skill.id];
        if (val !== undefined) {
            ratedCount++;
            if (val > 0)
                values.push(val);
        }
    }
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { avg, ratedCount, totalCount: cat.skills.length };
}
// ─── Response interfaces matching src/lib/types.ts ───────────
interface CategoryAggregateResponse {
    categoryId: string;
    categoryLabel: string;
    avgRank: number;
    teamAvgRank: number;
    targetRank: number;
    gap: number;
    ratedCount: number;
    totalCount: number;
}
interface GapResponse {
    categoryId: string;
    categoryLabel: string;
    gap: number;
    avgRank: number;
    targetRank: number;
}
interface MemberAggregateResponse {
    memberId: string;
    memberName: string;
    role: string;
    submittedAt: string | null;
    status: EvaluationStatus;
    answeredCount: number;
    coveredCount: number;
    totalCount: number;
    catalogAnsweredCount: number;
    catalogCoveredCount: number;
    catalogTotalCount: number;
    hasRatings: boolean;
    categories: CategoryAggregateResponse[];
    topGaps: GapResponse[];
    topStrengths: {
        categoryId: string;
        categoryLabel: string;
        avgRank: number;
    }[];
    profileSummary: string | null;
}
interface TeamCategoryAggregateResponse {
    categoryId: string;
    categoryLabel: string;
    teamAvgRank: number;
    minRank: number;
    maxRank: number;
    skillAverages: Record<string, number>;
}
interface TeamMemberAggregateResponse {
    slug: string;
    name: string;
    role: string;
    team: string;
    pole: string | null;
    submittedAt: string | null;
    status: EvaluationStatus;
    answeredCount: number;
    coveredCount: number;
    totalCount: number;
    catalogAnsweredCount: number;
    catalogCoveredCount: number;
    catalogTotalCount: number;
    categoryAverages: Record<string, number>;
    skillRatings: Record<string, number>;
    topGaps: {
        categoryId: string;
        gap: number;
    }[];
    topStrengths: {
        categoryId: string;
        avg: number;
    }[];
    lastActivityAt: string | null;
    skillDates: Record<string, string>;
    progressionDelta: number;
}
interface TeamAggregateResponse {
    teamSize: number;
    submittedCount: number;
    categoryTargets: Record<string, number>;
    categories: TeamCategoryAggregateResponse[];
    members: TeamMemberAggregateResponse[];
}
// ─── Compute member aggregate ────────────────────────────────
export async function computeMemberAggregate(slug: string): Promise<MemberAggregateResponse | null> {
    const member = teamMembers.find((m) => m.slug === slug);
    if (!member)
        return null;
    const skillCategories = getSkillCategories();
    const allRatings = await getAllEvaluations();
    const targets = readTargets();
    const formScopes = await resolveMemberFormScopes(teamMembers);
    const memberScope = formScopes.get(member.slug)!;
    const memberData = allRatings[slug];
    const hasRatings = !!memberData && Object.keys(memberData.ratings).length > 0;
    const memberProgress = computeEvaluationProgress(memberData ?? null, memberScope.requiredCategories);
    const catalogProgress = computeEvaluationProgress(memberData ?? null, skillCategories);
    // Team averages use complete evaluations only; stale submitted_at flags do not count.
    const submittedEntries = Object.entries(allRatings).filter(([entrySlug, data]) => {
        const entryScope = formScopes.get(entrySlug);
        if (!entryScope)
            return false;
        return computeEvaluationProgress(data, entryScope.requiredCategories).status === 'submitted';
    });
    const memberRatings = memberData?.ratings ?? {};
    const roleTargets = targets[member.role] ?? {};
    const categories: CategoryAggregateResponse[] = skillCategories.map((cat) => {
        const { avg: avgRank, ratedCount, totalCount } = memberCategoryAvg(cat.id, memberRatings);
        // Team average: mean of all submitted members' category averages
        const teamAvgs = submittedEntries
            .map(([, data]) => memberCategoryAvg(cat.id, data.ratings).avg)
            .filter((v) => v > 0);
        const teamAvgRank = teamAvgs.length > 0
            ? teamAvgs.reduce((a, b) => a + b, 0) / teamAvgs.length
            : 0;
        const targetRank = roleTargets[cat.id] ?? 0;
        const gap = targetRank - avgRank; // positive = below target
        return {
            categoryId: cat.id,
            categoryLabel: cat.label,
            avgRank: Math.round(avgRank * 100) / 100,
            teamAvgRank: Math.round(teamAvgRank * 100) / 100,
            targetRank,
            gap: Math.round(gap * 100) / 100,
            ratedCount,
            totalCount,
        };
    });
    // Top 3 gaps sorted descending (largest gap first)
    const topGaps: GapResponse[] = [...categories]
        .filter((c) => c.gap > 0)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 3)
        .map((c) => ({
        categoryId: c.categoryId,
        categoryLabel: c.categoryLabel,
        gap: c.gap,
        avgRank: c.avgRank,
        targetRank: c.targetRank,
    }));
    // Top 3 strengths sorted descending (highest avg first)
    const topStrengths = [...categories]
        .filter((c) => c.avgRank > 0)
        .sort((a, b) => b.avgRank - a.avgRank)
        .slice(0, 3)
        .map((c) => ({ categoryId: c.categoryId, categoryLabel: c.categoryLabel, avgRank: c.avgRank }));
    return {
        memberId: member.slug,
        memberName: member.name,
        role: member.role,
        submittedAt: memberProgress.status === 'submitted' ? memberData?.submittedAt ?? null : null,
        status: memberProgress.status,
        answeredCount: memberProgress.answeredCount,
        coveredCount: memberProgress.coveredCount,
        totalCount: memberProgress.totalCount,
        catalogAnsweredCount: catalogProgress.answeredCount,
        catalogCoveredCount: catalogProgress.coveredCount,
        catalogTotalCount: catalogProgress.totalCount,
        hasRatings,
        categories,
        topGaps,
        topStrengths,
        profileSummary: memberData?.profileSummary ?? null,
    };
}
// ─── Compute team aggregate ──────────────────────────────────
export async function computeTeamAggregate(pole?: string): Promise<TeamAggregateResponse> {
    const allSkillCategories = getSkillCategories();
    const allRatings = await getAllEvaluations();
    const targets = readTargets();
    // Filter categories by pole if specified
    let skillCategories = allSkillCategories;
    if (pole) {
        const db = getDb();
        const poleCatRows = await db.prepare('SELECT category_id FROM pole_categories WHERE pole = ?')
            .all(pole) as {
            category_id: string;
        }[];
        const poleCatIds = new Set(poleCatRows.map(r => r.category_id));
        skillCategories = allSkillCategories.filter(c => poleCatIds.has(c.id));
    }
    // Filter team members by pole if specified
    const filteredMembers = pole
        ? teamMembers.filter(m => m.pole === pole || m.pole === null)
        : teamMembers;
    const filteredSlugs = new Set(filteredMembers.map(m => m.slug));
    const formScopes = await resolveMemberFormScopes(filteredMembers);
    const progressBySlug = new Map<string, ReturnType<typeof computeEvaluationProgress>>();
    const catalogProgressBySlug = new Map<string, ReturnType<typeof computeEvaluationProgress>>();
    for (const member of filteredMembers) {
        const scope = formScopes.get(member.slug)!;
        progressBySlug.set(member.slug, computeEvaluationProgress(allRatings[member.slug] ?? null, scope.requiredCategories));
        catalogProgressBySlug.set(member.slug, computeEvaluationProgress(allRatings[member.slug] ?? null, allSkillCategories));
    }
    const submittedEntries = Object.entries(allRatings).filter(([slug, data]) => {
        if (!filteredSlugs.has(slug))
            return false;
        const scope = formScopes.get(slug);
        const progress = progressBySlug.get(slug) ?? (scope ? computeEvaluationProgress(data, scope.requiredCategories) : null);
        return progress?.status === 'submitted';
    });
    const submittedCount = submittedEntries.length;
    // Team-level category stats
    const categories: TeamCategoryAggregateResponse[] = skillCategories.map((cat) => {
        const avgs = submittedEntries
            .map(([, data]) => memberCategoryAvg(cat.id, data.ratings).avg)
            .filter((v) => v > 0);
        const teamAvgRank = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
        const minRank = avgs.length > 0 ? Math.min(...avgs) : 0;
        const maxRank = avgs.length > 0 ? Math.max(...avgs) : 0;
        // Per-skill team averages
        const skillAverages: Record<string, number> = {};
        for (const skill of cat.skills) {
            const vals = submittedEntries
                .map(([, data]) => data.ratings[skill.id])
                .filter((v) => v !== undefined && v > 0);
            skillAverages[skill.id] =
                vals.length > 0
                    ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
                    : 0;
        }
        return {
            categoryId: cat.id,
            categoryLabel: cat.label,
            teamAvgRank: Math.round(teamAvgRank * 100) / 100,
            minRank: Math.round(minRank * 100) / 100,
            maxRank: Math.round(maxRank * 100) / 100,
            skillAverages,
        };
    });
    // R8: Fetch all skill changes for lastActivityAt, skillDates, and progressionDelta
    const db = getDb();
    const allChanges = await db.prepare(`
    SELECT slug, skill_id, old_level, new_level, changed_at
    FROM skill_changes ORDER BY changed_at ASC
  `).all() as {
        slug: string;
        skill_id: string;
        old_level: number;
        new_level: number;
        changed_at: string;
    }[];
    const lastActivityBySlug: Record<string, string> = {};
    const skillDatesBySlug: Record<string, Record<string, string>> = {};
    const firstLevelBySlugSkill: Record<string, Record<string, number>> = {};
    const lastLevelBySlugSkill: Record<string, Record<string, number>> = {};
    for (const row of allChanges) {
        // Last activity (latest date per member)
        if (!lastActivityBySlug[row.slug] || row.changed_at > lastActivityBySlug[row.slug]) {
            lastActivityBySlug[row.slug] = row.changed_at;
        }
        // Skill dates (latest date per skill — last one wins since ordered ASC)
        if (!skillDatesBySlug[row.slug])
            skillDatesBySlug[row.slug] = {};
        skillDatesBySlug[row.slug][row.skill_id] = row.changed_at;
        // First level per skill (initial assessment baseline)
        if (!firstLevelBySlugSkill[row.slug])
            firstLevelBySlugSkill[row.slug] = {};
        if (!(row.skill_id in firstLevelBySlugSkill[row.slug])) {
            firstLevelBySlugSkill[row.slug][row.skill_id] = row.old_level === 0 ? row.new_level : row.old_level;
        }
        // Last level per skill
        if (!lastLevelBySlugSkill[row.slug])
            lastLevelBySlugSkill[row.slug] = {};
        lastLevelBySlugSkill[row.slug][row.skill_id] = row.new_level;
    }
    // Compute progression delta per member: current avg - initial avg
    const progressionDeltaBySlug: Record<string, number> = {};
    for (const slug of Object.keys(lastLevelBySlugSkill)) {
        const firsts = Object.values(firstLevelBySlugSkill[slug] ?? {});
        const lasts = Object.values(lastLevelBySlugSkill[slug] ?? {});
        if (firsts.length === 0)
            continue;
        const initialAvg = firsts.reduce((a, b) => a + b, 0) / firsts.length;
        const currentAvg = lasts.reduce((a, b) => a + b, 0) / lasts.length;
        progressionDeltaBySlug[slug] = Math.round((currentAvg - initialAvg) * 10) / 10;
    }
    // Per-member summaries
    const members: TeamMemberAggregateResponse[] = filteredMembers.map((member) => {
        const memberData = allRatings[member.slug];
        const memberRatings = memberData?.ratings ?? {};
        const progress = progressBySlug.get(member.slug)!;
        const catalogProgress = catalogProgressBySlug.get(member.slug)!;
        const roleTargets = targets[member.role] ?? {};
        const categoryAverages: Record<string, number> = {};
        for (const cat of skillCategories) {
            categoryAverages[cat.id] =
                Math.round(memberCategoryAvg(cat.id, memberRatings).avg * 100) / 100;
        }
        // Compute gaps for this member
        const topGaps = skillCategories
            .map((cat) => {
            const avgRank = memberCategoryAvg(cat.id, memberRatings).avg;
            const targetRank = roleTargets[cat.id] ?? 0;
            const gap = targetRank - avgRank;
            return {
                categoryId: cat.id,
                gap: Math.round(gap * 100) / 100,
            };
        })
            .filter((g) => g.gap > 0)
            .sort((a, b) => b.gap - a.gap)
            .slice(0, 3);
        // Per-skill ratings (all skills, for radar overlays)
        const skillRatings: Record<string, number> = {};
        for (const cat of skillCategories) {
            for (const skill of cat.skills) {
                const val = memberRatings[skill.id];
                if (val !== undefined && val >= 0) {
                    skillRatings[skill.id] = val;
                }
            }
        }
        // Top 3 strongest categories (highest avg, only rated)
        const topStrengths = skillCategories
            .map((cat) => ({
            categoryId: cat.id,
            avg: Math.round(memberCategoryAvg(cat.id, memberRatings).avg * 100) / 100,
        }))
            .filter((s) => s.avg > 0)
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 3);
        return {
            slug: member.slug,
            name: member.name,
            role: member.role,
            team: member.team,
            pole: member.pole,
            submittedAt: progress.status === 'submitted' ? memberData?.submittedAt ?? null : null,
            status: progress.status,
            answeredCount: progress.answeredCount,
            coveredCount: progress.coveredCount,
            totalCount: progress.totalCount,
            catalogAnsweredCount: catalogProgress.answeredCount,
            catalogCoveredCount: catalogProgress.coveredCount,
            catalogTotalCount: catalogProgress.totalCount,
            categoryAverages,
            skillRatings,
            topGaps,
            topStrengths,
            lastActivityAt: [lastActivityBySlug[member.slug], memberData?.submittedAt]
                .filter((d): d is string => !!d)
                .sort()
                .pop() ?? null,
            skillDates: skillDatesBySlug[member.slug] ?? {},
            progressionDelta: progressionDeltaBySlug[member.slug] ?? 0,
        };
    });
    // Weighted team target per category: average of each submitted member's role target
    const categoryTargets: Record<string, number> = {};
    for (const cat of skillCategories) {
        const targetValues = submittedEntries
            .map(([slug]) => {
            const member = filteredMembers.find((m) => m.slug === slug);
            if (!member)
                return null;
            const roleTarget = targets[member.role];
            return roleTarget?.[cat.id] ?? 0;
        })
            .filter((v): v is number => v !== null);
        categoryTargets[cat.id] =
            targetValues.length > 0
                ? Math.round((targetValues.reduce((a, b) => a + b, 0) / targetValues.length) * 100) / 100
                : 0;
    }
    return {
        teamSize: filteredMembers.length,
        submittedCount,
        categoryTargets,
        categories,
        members,
    };
}
