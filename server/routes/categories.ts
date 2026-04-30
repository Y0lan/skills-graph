import { Router } from 'express';
import { getSkillCategories } from '../lib/catalog.js';
export const categoriesRouter = Router();
categoriesRouter.get('/', (_req, res) => {
    const skillCategories = getSkillCategories();
    const body = skillCategories.map((cat, i) => ({
        id: cat.id,
        label: cat.label,
        emoji: cat.emoji,
        order: i + 1,
        skills: cat.skills,
    }));
    res.json(body);
});
