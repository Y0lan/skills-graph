import { Router } from 'express';
import { findMember, teamMembers } from '../data/team-roster.js';
import { resolveMemberFormScope } from '../lib/member-form-scope.js';
export const membersRouter = Router();
// GET / — team roster
membersRouter.get('/', (_req, res) => {
    res.json(teamMembers);
});

// GET /:slug/form-config — required vs optional Skill Radar scope for one team member.
membersRouter.get('/:slug/form-config', async (req, res) => {
    const member = findMember(req.params.slug);
    if (!member) {
        res.status(404).json({ error: 'Membre introuvable' });
        return;
    }
    const scope = await resolveMemberFormScope(member);
    res.json({
        member: scope.member,
        requiredCategoryIds: scope.requiredCategoryIds,
        optionalGroups: scope.optionalGroups,
        source: scope.source,
        requiredCategoryCount: scope.requiredCategoryCount,
        optionalCategoryCount: scope.optionalCategoryCount,
        catalogCategoryCount: scope.catalogCategoryCount,
        requiredQuestionCount: scope.requiredQuestionCount,
        optionalQuestionCount: scope.optionalQuestionCount,
        catalogQuestionCount: scope.catalogQuestionCount,
    });
});
