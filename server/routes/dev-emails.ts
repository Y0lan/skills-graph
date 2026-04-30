import { Router } from 'express';
import { render } from '@react-email/components';
import { requireLead } from '../middleware/require-lead.js';
import { renderTransitionEmail } from '../lib/email.js';
import { previewizeEmailHtml } from '../lib/brand.js';
import { CandidateInvite } from '../emails/candidate-invite.js';
import { CandidateSubmitted } from '../emails/candidate-submitted.js';
import { CandidatureRecue, CandidatureRecueLead } from '../emails/candidature-recue.js';
import { CandidatureRefusee } from '../emails/candidature-refusee.js';
import { TransitionNotification } from '../emails/transition-notification.js';
/**
 * Dev-only email preview routes. Mounted only when NODE_ENV !== 'production'
 * (gated in server/index.ts). All routes additionally require a recruitment
 * lead session so a public dev URL leak doesn't expose the index of templates.
 *
 * Why no production mount: even with mock data, a misconfigured forwarder
 * could end up sending real candidate context through this surface. Keep it
 * local-only.
 */
export const devEmailsRouter = Router();
devEmailsRouter.use(requireLead);
const MOCK = {
    candidateName: 'Marie Dupont',
    role: 'Tech Lead Java',
    candidateEmail: 'marie.dupont@example.com',
    leadEmail: 'guillaume.benoit@sinapse.nc',
    evaluationUrl: 'http://localhost:5173/evaluate/mock-id',
    detailUrl: 'http://localhost:5173/recruit/mock-id',
} as const;
interface PreviewItem {
    slug: string;
    label: string;
    render: () => Promise<string>;
}
const PREVIEWS: PreviewItem[] = [
    {
        slug: 'candidate-invite',
        label: 'Invitation candidat (lien d’évaluation)',
        render: async () => render(CandidateInvite({
            candidateName: MOCK.candidateName,
            role: MOCK.role,
            evaluationUrl: MOCK.evaluationUrl,
        })),
    },
    {
        slug: 'candidate-submitted',
        label: 'Candidat → soumission au lead',
        render: async () => render(CandidateSubmitted({
            candidateName: MOCK.candidateName,
            role: MOCK.role,
            detailUrl: MOCK.detailUrl,
        })),
    },
    {
        slug: 'candidature-recue',
        label: 'Candidature reçue (au candidat)',
        render: async () => render(CandidatureRecue({
            candidateName: MOCK.candidateName,
            role: MOCK.role,
        })),
    },
    {
        slug: 'candidature-recue-lead',
        label: 'Candidature reçue (au lead)',
        render: async () => render(CandidatureRecueLead({
            candidateName: MOCK.candidateName,
            role: MOCK.role,
        })),
    },
    {
        slug: 'candidature-refusee',
        label: 'Candidature refusée (au candidat)',
        render: async () => render(CandidatureRefusee({
            candidateName: MOCK.candidateName,
            role: MOCK.role,
        })),
    },
    {
        slug: 'transition-notification',
        label: 'Notification au lead — changement de statut (composant)',
        render: async () => render(TransitionNotification({
            candidateName: MOCK.candidateName,
            role: MOCK.role,
            statut: 'preselectionne',
            bodyHtml: '<p>Marie Dupont a été présélectionnée pour le poste de Tech Lead Java.</p>',
        })),
    },
    // Transition emails per statut, via the canonical renderer
    ...['preselectionne', 'skill_radar_envoye', 'entretien_1', 'entretien_2', 'proposition', 'embauche', 'refuse'].map((statut) => ({
        slug: `transition-${statut}`,
        label: `Transition (par défaut) — ${statut}`,
        render: async () => {
            const out = await renderTransitionEmail({
                candidateName: MOCK.candidateName,
                role: MOCK.role,
                statut,
                evaluationUrl: MOCK.evaluationUrl,
            });
            return out?.html ?? `<p>(no template for "${statut}")</p>`;
        },
    })),
];
// Index page — list every template with a link.
devEmailsRouter.get('/', (_req, res) => {
    const items = PREVIEWS.map(p => `<li><a href="/dev/emails/${p.slug}" target="preview">${p.label}</a> <span style="color:#888">(${p.slug})</span></li>`).join('\n');
    res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Dev — Email previews</title></head>
<body style="font-family:system-ui;padding:24px;display:flex;gap:24px;">
  <div style="flex:0 0 320px">
    <h1 style="font-size:18px">Email previews</h1>
    <p style="color:#666;font-size:13px">Données fictives. Aucun envoi réel.</p>
    <ul style="font-size:14px;line-height:1.8">${items}</ul>
  </div>
  <iframe name="preview" style="flex:1;border:1px solid #ddd;min-height:90vh;background:#fff"></iframe>
</body></html>`);
});
devEmailsRouter.get('/:slug', async (req, res) => {
    const item = PREVIEWS.find(p => p.slug === req.params.slug);
    if (!item) {
        res.status(404).send('Template inconnu');
        return;
    }
    try {
        const html = await item.render();
        res.type('html').send(previewizeEmailHtml(html));
    }
    catch (err) {
        console.error('[dev-emails] render failed', err);
        res.status(500).type('html').send(`<pre>${(err as Error).message}</pre>`);
    }
});
