import type { SkillCategory } from '../../src/data/skill-catalog.js';
import type { MemberEvaluation } from './db.js';
import { getSkillCategories } from './catalog.js';

export type EvaluationStatus = 'none' | 'draft' | 'submitted';

export interface EvaluationProgress {
    status: EvaluationStatus;
    answeredCount: number;
    coveredCount: number;
    totalCount: number;
}

function isAnsweredRating(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function computeEvaluationProgress(
    evaluation: Pick<MemberEvaluation, 'ratings' | 'skippedCategories' | 'declinedCategories'> | null | undefined,
    categories: SkillCategory[] = getSkillCategories(),
): EvaluationProgress {
    const totalCount = categories.reduce((sum, category) => sum + category.skills.length, 0);
    if (!evaluation || totalCount === 0) {
        return { status: 'none', answeredCount: 0, coveredCount: 0, totalCount };
    }

    const coveredSkillIds = new Set<string>();
    let answeredCount = 0;
    for (const category of categories) {
        const categoryClosed =
            evaluation.skippedCategories.includes(category.id) ||
            evaluation.declinedCategories.includes(category.id);
        for (const skill of category.skills) {
            if (isAnsweredRating(evaluation.ratings[skill.id])) {
                answeredCount += 1;
                coveredSkillIds.add(skill.id);
            }
            else if (categoryClosed) {
                coveredSkillIds.add(skill.id);
            }
        }
    }

    const coveredCount = coveredSkillIds.size;
    if (coveredCount === 0) {
        return { status: 'none', answeredCount, coveredCount, totalCount };
    }
    if (coveredCount >= totalCount) {
        return { status: 'submitted', answeredCount, coveredCount, totalCount };
    }
    return { status: 'draft', answeredCount, coveredCount, totalCount };
}

