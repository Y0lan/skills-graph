import { Router } from 'express';
import { getSkillCategories, getRatingScale, getCalibrationPrompts } from '../lib/catalog.js';
import { getDb } from '../lib/db.js';
export const catalogRouter = Router();
catalogRouter.get('/', async (req, res) => {
    const categories = getSkillCategories();
    const ratingScale = getRatingScale();
    const calibrationPrompts = getCalibrationPrompts();
    const pole = req.query.pole as string | undefined;
    let poleCategoryIds: Set<string> | null = null;
    if (pole) {
        const rows = await getDb()
            .prepare('SELECT category_id FROM pole_categories WHERE pole = ?')
            .all(pole) as {
            category_id: string;
        }[];
        poleCategoryIds = new Set(rows.map(r => r.category_id));
    }
    const body = {
        categories: categories.map((cat) => ({
            id: cat.id,
            label: cat.label,
            emoji: cat.emoji,
            skills: cat.skills,
            calibrationPrompt: calibrationPrompts[cat.id] ?? null,
            ...(poleCategoryIds != null && { isPoleCategory: poleCategoryIds.has(cat.id) }),
        })),
        ratingScale,
        ...(poleCategoryIds != null && { poleCategoryIds: [...poleCategoryIds] }),
    };
    res.json(body);
});
catalogRouter.get('/pole-categories/:pole', async (req, res) => {
    const { pole } = req.params;
    const validPoles = ['legacy', 'java_modernisation', 'fonctionnel'];
    if (!validPoles.includes(pole)) {
        return res.status(400).json({ error: 'Pôle invalide' });
    }
    const rows = await getDb()
        .prepare('SELECT category_id FROM pole_categories WHERE pole = ?')
        .all(pole) as {
        category_id: string;
    }[];
    res.json(rows.map(r => r.category_id));
});
// GET /pole-mappings — all pole→category mappings at once (for radar segments)
catalogRouter.get('/pole-mappings', async (_req, res) => {
    const rows = await getDb()
        .prepare('SELECT pole, category_id FROM pole_categories ORDER BY pole, category_id')
        .all() as {
        pole: string;
        category_id: string;
    }[];
    const result: Record<string, string[]> = {};
    for (const row of rows) {
        if (!result[row.pole])
            result[row.pole] = [];
        result[row.pole].push(row.category_id);
    }
    res.json(result);
});
const POLE_LABELS: Record<string, string> = {
    legacy: 'Pôle Legacy (Adélia / IBMi)',
    java_modernisation: 'Pôle Java / Modernisation',
    fonctionnel: 'Pôle Fonctionnel',
};
catalogRouter.get('/non-pole-categories/:pole', async (req, res) => {
    const { pole } = req.params;
    const validPoles = ['legacy', 'java_modernisation', 'fonctionnel'];
    if (!validPoles.includes(pole)) {
        return res.status(400).json({ error: 'Pôle invalide' });
    }
    const db = getDb();
    // Get this pole's category IDs
    const poleRows = await db
        .prepare('SELECT category_id FROM pole_categories WHERE pole = ?')
        .all(pole) as {
        category_id: string;
    }[];
    const poleCatIds = new Set(poleRows.map(r => r.category_id));
    // Get ALL pole_categories mappings: category_id -> pole[]
    const allMappings = await db
        .prepare('SELECT pole, category_id FROM pole_categories')
        .all() as {
        pole: string;
        category_id: string;
    }[];
    const categoryPoleMap = new Map<string, string[]>();
    for (const row of allMappings) {
        if (!categoryPoleMap.has(row.category_id))
            categoryPoleMap.set(row.category_id, []);
        categoryPoleMap.get(row.category_id)!.push(row.pole);
    }
    // Get all categories, exclude the ones that belong to this pole
    const allCategories = getSkillCategories();
    const nonPoleCategories = allCategories.filter(cat => !poleCatIds.has(cat.id));
    // Group by source pole; categories not in any pole go under "transverse"
    const groupMap = new Map<string, typeof allCategories>();
    for (const cat of nonPoleCategories) {
        const poles = categoryPoleMap.get(cat.id) ?? [];
        if (poles.length === 0) {
            if (!groupMap.has('transverse'))
                groupMap.set('transverse', []);
            groupMap.get('transverse')!.push(cat);
        }
        else {
            // Only put it under poles that are not the user's current pole
            const otherPoles = poles.filter(p => p !== pole);
            for (const p of otherPoles) {
                if (!groupMap.has(p))
                    groupMap.set(p, []);
                groupMap.get(p)!.push(cat);
            }
        }
    }
    const groups = Array.from(groupMap.entries()).map(([groupPole, cats]) => ({
        pole: groupPole,
        label: POLE_LABELS[groupPole] ?? groupPole,
        categories: cats.map(cat => ({
            id: cat.id,
            label: cat.label,
            skills: cat.skills,
        })),
    }));
    res.json({ groups });
});
