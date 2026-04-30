import fs from 'fs';
import path from 'path';
const CATALOG_PATH = path.join(process.cwd(), 'skill-catalog-full.json');
interface DbLike {
    prepare<T = unknown>(sql: string): {
        all(...params: unknown[]): Promise<T[]>;
        get(...params: unknown[]): Promise<T | undefined>;
        run(...params: unknown[]): Promise<{
            changes: number;
        }>;
    };
    transaction<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn | Promise<TReturn>): (...args: TArgs) => Promise<TReturn>;
}
interface CatalogJson {
    ratingScale: Record<string, {
        label: string;
        description: string;
    }>;
    categories: {
        id: string;
        label: string;
        scenario?: string;
        skills: {
            id: string;
            label: string;
            descriptors: Record<string, string>;
        }[];
    }[];
}
// Short labels for rating scale (not in JSON)
const shortLabels: Record<number, string> = {
    0: '?',
    1: '1',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
};
// Level labels used in skill descriptors
const levelLabels: Record<number, string> = {
    0: 'Inconnu',
    1: 'Notions',
    2: 'Guidé',
    3: 'Autonome',
    4: 'Avancé',
    5: 'Expert',
};
export async function seedCatalog(db: DbLike): Promise<void> {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
    const catalog: CatalogJson = JSON.parse(raw);
    const insertCategory = db.prepare(`INSERT INTO categories (id, label, emoji, sort_order)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       label = EXCLUDED.label,
       emoji = EXCLUDED.emoji,
       sort_order = EXCLUDED.sort_order`);
    const insertCalibration = db.prepare(`INSERT INTO calibration_prompts (category_id, text, tools)
     VALUES (?, ?, ?)
     ON CONFLICT (category_id) DO UPDATE SET
       text = EXCLUDED.text,
       tools = EXCLUDED.tools`);
    const insertSkill = db.prepare(`INSERT INTO skills (id, category_id, label, sort_order)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       label = EXCLUDED.label,
       sort_order = EXCLUDED.sort_order`);
    const insertDescriptor = db.prepare(`INSERT INTO skill_descriptors (skill_id, level, label, description)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (skill_id, level) DO UPDATE SET
       label = EXCLUDED.label,
       description = EXCLUDED.description`);
    const insertRating = db.prepare(`INSERT INTO rating_scale (value, label, short_label, description)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (value) DO UPDATE SET
       label = EXCLUDED.label,
       short_label = EXCLUDED.short_label,
       description = EXCLUDED.description`);
    const seed = db.transaction(async () => {
        // Migrate renamed skill IDs in existing evaluations
        const SKILL_RENAMES: Record<string, string> = {
            'sentry': 'error-tracking',
            'redis-dragonfly': 'redis',
            'iam-keycloak': 'iam-authn',
            'technical-writing': 'vulgarisation-pedagogie',
        };
        const CATEGORY_RENAMES: Record<string, string> = {
            'soft-skills': 'soft-skills-delivery',
        };
        const REMOVED_SKILLS = ['mfa-yubikey'];
        const evalRows = await db.prepare<{
            slug: string;
            ratings: string;
            skipped_categories: string;
        }>('SELECT slug, ratings, skipped_categories FROM evaluations').all();
        for (const row of evalRows) {
            const ratings: Record<string, number> = JSON.parse(row.ratings);
            let changed = false;
            // Rename skill IDs
            for (const [oldId, newId] of Object.entries(SKILL_RENAMES)) {
                if (oldId in ratings) {
                    ratings[newId] = ratings[oldId];
                    delete ratings[oldId];
                    changed = true;
                }
            }
            // Remove deleted skills
            for (const id of REMOVED_SKILLS) {
                if (id in ratings) {
                    delete ratings[id];
                    changed = true;
                }
            }
            // Rename category IDs in skipped_categories
            const skipped: string[] = JSON.parse(row.skipped_categories);
            const newSkipped = skipped.map((id) => CATEGORY_RENAMES[id] ?? id);
            const skippedChanged = JSON.stringify(skipped) !== JSON.stringify(newSkipped);
            if (changed || skippedChanged) {
                await db.prepare('UPDATE evaluations SET ratings = ?, skipped_categories = ? WHERE slug = ?')
                    .run(JSON.stringify(ratings), JSON.stringify(newSkipped), row.slug);
            }
        }
        // Rating scale
        for (const [valueStr, entry] of Object.entries(catalog.ratingScale)) {
            const value = parseInt(valueStr, 10);
            await insertRating.run(value, entry.label, shortLabels[value] ?? valueStr, entry.description);
        }
        // Categories, skills, descriptors
        for (let catIdx = 0; catIdx < catalog.categories.length; catIdx++) {
            const cat = catalog.categories[catIdx];
            await insertCategory.run(cat.id, cat.label, '', catIdx);
            // Calibration prompt (scenario from JSON)
            if (cat.scenario) {
                await insertCalibration.run(cat.id, cat.scenario, '[]');
            }
            // Skills
            for (let skillIdx = 0; skillIdx < cat.skills.length; skillIdx++) {
                const skill = cat.skills[skillIdx];
                await insertSkill.run(skill.id, cat.id, skill.label, skillIdx);
                // Descriptors
                for (const [levelStr, description] of Object.entries(skill.descriptors)) {
                    const level = parseInt(levelStr, 10);
                    await insertDescriptor.run(skill.id, level, levelLabels[level] ?? `Level ${level}`, description);
                }
            }
        }
        // Migrate role_categories to renamed category IDs before the cascade wipes
        // them. role_categories.category_id has ON DELETE CASCADE, so any unrenamed
        // rows pointing at the old ID would vanish when we prune the categories
        // table below — silently stripping categories off recruitment roles.
        for (const [oldId, newId] of Object.entries(CATEGORY_RENAMES)) {
            await db.prepare(`UPDATE role_categories SET category_id = ?
         WHERE category_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM role_categories rc2
             WHERE rc2.role_id = role_categories.role_id
               AND rc2.category_id = ?
           )`).run(newId, oldId, newId);
            // UPDATE OR IGNORE skips rows that would collide with an existing
            // (role_id, newId) pair. Drop any such leftovers so the cascade has
            // nothing to do for them.
            await db.prepare('DELETE FROM role_categories WHERE category_id = ?').run(oldId);
        }
        // Clean up orphaned rows from skills/categories removed from the catalog
        const currentSkillIds = catalog.categories.flatMap(c => c.skills.map(s => s.id));
        const currentCatIds = catalog.categories.map(c => c.id);
        if (currentSkillIds.length > 0) {
            const skillPlaceholders = currentSkillIds.map(() => '?').join(',');
            await db.prepare(`DELETE FROM skill_descriptors WHERE skill_id NOT IN (${skillPlaceholders})`).run(...currentSkillIds);
            await db.prepare(`DELETE FROM skills WHERE id NOT IN (${skillPlaceholders})`).run(...currentSkillIds);
        }
        if (currentCatIds.length > 0) {
            const catPlaceholders = currentCatIds.map(() => '?').join(',');
            await db.prepare(`DELETE FROM calibration_prompts WHERE category_id NOT IN (${catPlaceholders})`).run(...currentCatIds);
            await db.prepare(`DELETE FROM categories WHERE id NOT IN (${catPlaceholders})`).run(...currentCatIds);
        }
    });
    await seed();
}
