import { Resend } from 'resend';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { render } from '@react-email/components';
import { getDb } from './db.js';
import { CandidateInvite } from '../emails/candidate-invite.js';
import { CandidateSubmitted } from '../emails/candidate-submitted.js';
import { CandidatureRecue, CandidatureRecueLead } from '../emails/candidature-recue.js';
import { CandidatureRefusee, CandidatureRefuseeLead } from '../emails/candidature-refusee.js';
import { TransitionNotification } from '../emails/transition-notification.js';
import { CustomBodyLayout } from '../emails/custom-body-layout.js';
import { BRAND_LOGO_BUFFER, LOGO_CID } from './brand.js';
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Radar SINAPSE <radar@sinapse.nc>';
// Inline-image attachment, returned only when the rendered HTML actually
// references the SINAPSE logo via `cid:sinapse-logo`. Templates that do not
// use the branded layout (e.g. CandidateInvite) get no attachment, so emails
// stay slim. See server/lib/brand.ts for why CID and not data:/external URL.
function maybeLogoAttachment(html: string) {
    if (!BRAND_LOGO_BUFFER)
        return undefined;
    if (!html.includes(`cid:${LOGO_CID}`))
        return undefined;
    return [{
            filename: 'sinapse-logo.png',
            content: BRAND_LOGO_BUFFER,
            contentType: 'image/png',
            contentId: LOGO_CID,
        }];
}
const SANITIZE_OPTIONS = {
    allowedTags: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
    allowedAttributes: { a: ['href'] },
};
export async function sendCandidateInvite(opts: {
    to: string;
    candidateName: string;
    role: string;
    evaluationUrl: string;
}) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[EMAIL] RESEND_API_KEY not set — skipping email');
        return null;
    }
    try {
        const html = await render(CandidateInvite({
            candidateName: opts.candidateName,
            role: opts.role,
            evaluationUrl: encodeURI(opts.evaluationUrl),
        }));
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: opts.to,
            subject: `Évaluation de compétences — ${opts.role} chez SINAPSE`,
            html,
            attachments: maybeLogoAttachment(html),
        });
        if (error) {
            console.error('[EMAIL] Send invitation failed');
            return null;
        }
        console.log(`[EMAIL] Invitation sent (id: ${data?.id})`);
        return data;
    }
    catch {
        console.error('[EMAIL] Failed to send invitation');
        return null;
    }
}
export async function sendCandidateSubmitted(opts: {
    to: string;
    candidateName: string;
    role: string;
    detailUrl: string;
}) {
    if (!process.env.RESEND_API_KEY)
        return null;
    try {
        const html = await render(CandidateSubmitted({
            candidateName: opts.candidateName,
            role: opts.role,
            detailUrl: opts.detailUrl,
        }));
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: opts.to,
            subject: `${opts.candidateName} a soumis son évaluation`,
            html,
            attachments: maybeLogoAttachment(html),
        });
        if (error) {
            console.error('[EMAIL] Send submission notification failed');
            return null;
        }
        console.log('[EMAIL] Submission notification sent');
        return data;
    }
    catch {
        console.error('[EMAIL] Failed to send submission notification');
        return null;
    }
}
/**
 * Markdown equivalent of the CandidatureRecue React template. Persisted
 * in candidature_events.email_snapshot.body so recruiters can see what
 * the candidate actually received without re-rendering the HTML.
 */
function renderApplicationReceivedMarkdown(candidateName: string): string {
    return [
        `Bonjour ${candidateName},`,
        ``,
        `Nous vous remercions vivement pour l'intérêt que vous portez au GIE SINAPSE et à son projet de refonte des parcours des travailleurs indépendants, des employeurs ainsi que des socles transverses, briques fondamentales du SI CAFAT.`,
        ``,
        `Votre candidature a bien été enregistrée. Notre équipe va l'étudier dans les prochains jours.`,
        ``,
        `**Vous n'avez rien à remplir à ce stade.** Si votre profil correspond à nos besoins, nous reviendrons vers vous par email avec un lien personnel vers un questionnaire d'auto-évaluation des compétences.`,
        ``,
        `Ce questionnaire sera à remplir avec la plus grande honnêteté : chacune de vos réponses pourra être discutée et challengée lors d'un entretien avec notre équipe technique.`,
        ``,
        `Le GIE SINAPSE intervient en tant qu'assistant à maîtrise d'ouvrage pour le compte de la CAFAT sur un programme structurant de transformation numérique de la protection sociale.`,
        ``,
        `En l'absence de réponse de notre part dans un délai de 15 jours, vous pourrez considérer que nous ne sommes pas en mesure de donner une suite favorable à votre candidature.`,
        ``,
        `Nous vous remercions pour votre démarche et vous souhaitons pleine réussite dans vos projets professionnels.`,
        ``,
        `Cordialement,`,
    ].join('\n');
}
function renderApplicationReceivedLeadMarkdown(candidateName: string, role: string): string {
    return [
        `# Nouvelle candidature`,
        ``,
        `**${candidateName}** a postulé pour le poste de **${role}**.`,
        ``,
        `Consultez le pipeline de recrutement pour examiner cette candidature.`,
    ].join('\n');
}
export async function sendApplicationReceived(opts: {
    candidateName: string;
    role: string;
    candidateEmail: string;
    leadEmail: string;
    /** When set, a candidature_events row of type 'email_sent' is inserted on success
     * so the frontend tracking card surfaces this email alongside the transition ones. */
    candidatureId?: string;
}) {
    if (!process.env.RESEND_API_KEY)
        return null;
    // Email to candidate
    const candidateSubject = `Candidature reçue — ${opts.role} chez SINAPSE`;
    const candidateBodyMd = renderApplicationReceivedMarkdown(opts.candidateName);
    try {
        const html = await render(CandidatureRecue({
            candidateName: opts.candidateName,
            role: opts.role,
        }));
        const { data } = await resend.emails.send({
            from: FROM_EMAIL,
            to: opts.candidateEmail,
            subject: candidateSubject,
            html,
            attachments: maybeLogoAttachment(html),
        });
        console.log('[EMAIL] Application received sent to candidate');
        if (opts.candidatureId && data?.id) {
            try {
                await getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, email_snapshot, created_by)
          VALUES (?, 'email_sent', ?, ?, 'system')
        `).run(opts.candidatureId, `Confirmation de candidature envoyée à ${opts.candidateEmail}`, JSON.stringify({ subject: candidateSubject, body: candidateBodyMd, messageId: data.id, recipient: 'candidate', to: opts.candidateEmail }));
            }
            catch {
                console.error('[EMAIL] Failed to record email_sent event for application-received');
            }
        }
    }
    catch {
        console.error('[EMAIL] Failed to send application received (candidate)');
    }
    // Email to lead (+ director if configured)
    const internalRecipients = [opts.leadEmail];
    if (process.env.DIRECTOR_EMAIL)
        internalRecipients.push(process.env.DIRECTOR_EMAIL);
    const leadSubject = `Nouvelle candidature : ${opts.candidateName} — ${opts.role}`;
    const leadBodyMd = renderApplicationReceivedLeadMarkdown(opts.candidateName, opts.role);
    try {
        const html = await render(CandidatureRecueLead({
            candidateName: opts.candidateName,
            role: opts.role,
        }));
        const { data } = await resend.emails.send({
            from: FROM_EMAIL,
            to: internalRecipients,
            subject: leadSubject,
            html,
            attachments: maybeLogoAttachment(html),
        });
        console.log('[EMAIL] Application received sent to lead');
        // Log the lead notification too so the tracking card shows it (and
        // so delivery/bounce webhooks for this message can correlate back).
        if (opts.candidatureId && data?.id) {
            try {
                await getDb().prepare(`
          INSERT INTO candidature_events (candidature_id, type, notes, email_snapshot, created_by)
          VALUES (?, 'email_sent', ?, ?, 'system')
        `).run(opts.candidatureId, `Notification interne envoyée à ${internalRecipients.join(', ')}`, JSON.stringify({ subject: leadSubject, body: leadBodyMd, messageId: data.id, recipient: 'lead', to: internalRecipients }));
            }
            catch {
                console.error('[EMAIL] Failed to record email_sent event for application-received (lead)');
            }
        }
    }
    catch {
        console.error('[EMAIL] Failed to send application received (lead)');
    }
}
export async function sendCandidateDeclined(opts: {
    candidateName: string;
    role: string;
    candidateEmail: string;
    leadEmail: string;
    reason?: string;
    includeReason?: boolean;
    skipCandidateEmail?: boolean;
}) {
    if (!process.env.RESEND_API_KEY)
        return null;
    // Email to candidate
    if (!opts.skipCandidateEmail) {
        try {
            const html = await render(CandidatureRefusee({
                candidateName: opts.candidateName,
                role: opts.role,
            }));
            await resend.emails.send({
                from: FROM_EMAIL,
                to: opts.candidateEmail,
                subject: `Candidature — ${opts.role} chez SINAPSE`,
                html,
                attachments: maybeLogoAttachment(html),
            });
            console.log('[EMAIL] Decline sent to candidate');
        }
        catch {
            console.error('[EMAIL] Failed to send decline (candidate)');
        }
    }
    // Email to lead (kept as-is)
    try {
        const html = await render(CandidatureRefuseeLead({
            candidateName: opts.candidateName,
            role: opts.role,
            reason: opts.reason,
            includeReason: opts.includeReason,
        }));
        await resend.emails.send({
            from: FROM_EMAIL,
            to: opts.leadEmail,
            subject: `Candidature refusée : ${opts.candidateName} — ${opts.role}`,
            html,
            attachments: maybeLogoAttachment(html),
        });
        console.log('[EMAIL] Decline confirmation sent to lead');
    }
    catch {
        console.error('[EMAIL] Failed to send decline (lead)');
    }
}
export async function sendTransitionNotification(opts: {
    to: string;
    candidateName: string;
    role: string;
    statut: string;
    notes?: string;
}) {
    if (!process.env.RESEND_API_KEY)
        return null;
    let subject: string;
    let bodyHtml: string;
    switch (opts.statut) {
        case 'preselectionne':
            subject = `Votre candidature a été présélectionnée — ${opts.role}`;
            bodyHtml = `Nous vous informons que votre candidature pour le poste de <strong>${escapeHtml(opts.role)}</strong> a été présélectionnée pour la suite du processus. L'évaluation se poursuit avec d'autres candidats. Nous reviendrons vers vous dès que nous aurons avancé dans notre sélection.`;
            break;
        case 'entretien_1':
        case 'entretien_2':
            subject = `Convocation entretien — ${opts.role}`;
            bodyHtml = `Nous souhaitons vous rencontrer pour le poste de <strong>${escapeHtml(opts.role)}</strong>. Un membre de notre équipe vous contactera pour fixer un créneau.`;
            break;
        case 'proposition':
            subject = `Proposition — ${opts.role} chez SINAPSE`;
            bodyHtml = `Nous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de <strong>${escapeHtml(opts.role)}</strong>.`;
            break;
        case 'embauche':
            subject = 'Bienvenue chez SINAPSE ! 🎉';
            bodyHtml = `Félicitations ! Vous rejoignez l'équipe SINAPSE au poste de <strong>${escapeHtml(opts.role)}</strong>. Bienvenue !`;
            break;
        default:
            return null;
    }
    try {
        const html = await render(TransitionNotification({
            candidateName: opts.candidateName,
            role: opts.role,
            statut: opts.statut,
            bodyHtml,
        }));
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: opts.to,
            subject,
            html,
            attachments: maybeLogoAttachment(html),
        });
        if (error) {
            console.error(`[EMAIL] Transition notification (${opts.statut}) send failed`);
            return null;
        }
        console.log(`[EMAIL] Transition notification (${opts.statut}) sent (id: ${data?.id})`);
        return data;
    }
    catch {
        console.error(`[EMAIL] Failed to send transition notification (${opts.statut})`);
        return null;
    }
}
// ─── Unified email dispatcher ──────────────────────────────────────
export function getEmailTemplate(statut: string, context: {
    candidateName: string;
    role: string;
    notes?: string;
    evaluationUrl?: string;
}): {
    subject: string;
    body: string;
} | null {
    const { candidateName, role, evaluationUrl } = context;
    switch (statut) {
        case 'skill_radar_envoye':
            return {
                subject: `Évaluation de compétences — ${role} chez SINAPSE`,
                body: `Bonjour ${candidateName} 👋\n\nVous êtes invité(e) à évaluer vos compétences pour le poste de **${role}** chez SINAPSE.\n\nCe questionnaire vous permet d'auto-évaluer vos compétences sur une échelle de 0 (inconnu) à 5 (expert). Soyez honnête — il n'y a pas de mauvaise réponse. Vos réponses sont sauvegardées automatiquement.\n\n[Commencer l'évaluation](${evaluationUrl ? encodeURI(evaluationUrl) : '#'})\n\nCe lien est personnel et expire dans 30 jours. Ne le partagez pas.\nSi vous avez des questions, contactez l'équipe SINAPSE.`,
            };
        case 'refuse':
            return {
                subject: `Candidature — ${role} chez SINAPSE`,
                body: `Bonjour Monsieur/Madame ${candidateName},\n\nNous vous remercions chaleureusement pour l'int\u00e9r\u00eat que vous portez au GIE SINAPSE ainsi que pour votre candidature.\n\nApr\u00e8s avoir examin\u00e9 attentivement votre dossier, nous avons le regret de vous informer que votre profil ne correspond pas \u00e0 nos besoins actuels.\n\nNous vous souhaitons une bonne continuation dans la poursuite de vos recherches.\n\nCordialement,`,
            };
        case 'preselectionne':
            return {
                subject: `Votre candidature a été présélectionnée — ${role}`,
                body: `Bonjour ${candidateName},\n\nNous vous informons que votre candidature pour le poste de **${role}** a été présélectionnée pour la suite du processus.\n\nL'évaluation se poursuit avec d'autres candidats. Nous reviendrons vers vous dès que nous aurons avancé dans notre sélection.\n\nCordialement,\nL'équipe SINAPSE`,
            };
        case 'entretien_1':
        case 'entretien_2':
            return {
                subject: `Convocation entretien — ${role}`,
                body: `Bonjour ${candidateName},\n\nNous souhaitons vous rencontrer pour le poste de **${role}**. Un membre de notre équipe vous contactera pour fixer un créneau.\n\nCordialement,\nL'équipe SINAPSE`,
            };
        case 'proposition':
            return {
                subject: `Proposition — ${role} chez SINAPSE`,
                body: `Bonjour ${candidateName},\n\nNous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de **${role}**.\n\nCordialement,\nL'équipe SINAPSE`,
            };
        case 'embauche':
            return {
                subject: 'Bienvenue chez SINAPSE ! 🎉',
                body: `Bonjour ${candidateName},\n\nFélicitations ! Vous rejoignez l'équipe SINAPSE au poste de **${role}**. Bienvenue !\n\nCordialement,\nL'équipe SINAPSE`,
            };
        default:
            return null;
    }
}
async function buildDefaultHtml(statut: string, context: {
    candidateName: string;
    role: string;
    notes?: string;
    includeReasonInEmail?: boolean;
    evaluationUrl?: string;
}): Promise<{
    subject: string;
    html: string;
} | null> {
    const { candidateName, role, evaluationUrl } = context;
    if (statut === 'skill_radar_envoye') {
        const html = await render(CandidateInvite({
            candidateName,
            role,
            evaluationUrl: encodeURI(evaluationUrl || ''),
        }));
        return {
            subject: `Évaluation de compétences — ${role} chez SINAPSE`,
            html,
        };
    }
    if (statut === 'refuse') {
        const html = await render(CandidatureRefusee({
            candidateName,
            role,
        }));
        return {
            subject: `Candidature — ${role} chez SINAPSE`,
            html,
        };
    }
    // For other transition statuses, reproduce sendTransitionNotification logic
    let subject: string;
    let bodyHtml: string;
    switch (statut) {
        case 'preselectionne':
            subject = `Votre candidature a été présélectionnée — ${role}`;
            bodyHtml = `Nous vous informons que votre candidature pour le poste de <strong>${escapeHtml(role)}</strong> a été présélectionnée pour la suite du processus. L'évaluation se poursuit avec d'autres candidats. Nous reviendrons vers vous dès que nous aurons avancé dans notre sélection.`;
            break;
        case 'entretien_1':
        case 'entretien_2':
            subject = `Convocation entretien — ${role}`;
            bodyHtml = `Nous souhaitons vous rencontrer pour le poste de <strong>${escapeHtml(role)}</strong>. Un membre de notre équipe vous contactera pour fixer un créneau.`;
            break;
        case 'proposition':
            subject = `Proposition — ${role} chez SINAPSE`;
            bodyHtml = `Nous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de <strong>${escapeHtml(role)}</strong>.`;
            break;
        case 'embauche':
            subject = 'Bienvenue chez SINAPSE ! 🎉';
            bodyHtml = `Félicitations ! Vous rejoignez l'équipe SINAPSE au poste de <strong>${escapeHtml(role)}</strong>. Bienvenue !`;
            break;
        default:
            return null;
    }
    const html = await render(TransitionNotification({
        candidateName,
        role,
        statut,
        bodyHtml,
    }));
    return { subject, html };
}
async function wrapInEmailLayout(htmlContent: string): Promise<string> {
    return await render(CustomBodyLayout({ bodyHtml: htmlContent }));
}
/**
 * Pure renderer for transition emails — no side effects, no Resend call.
 * SHARED by sendTransitionEmail (real send), the /api/recruitment/emails/preview
 * endpoint (Item 16), the /dev/emails inspector route (Item 17), and the
 * AI body wrapper (Item 18). Returns null when the statut has no template.
 */
/** Replace the first CTA-style anchor (text contains "Commencer l'évaluation"
 *  or "Compléter mon Skill Radar", etc.) with a centred, table-wrapped
 *  inline-styled button. Email clients ignore most CSS — inline styles on
 *  a `<table>` + `<a>` is the combo that works everywhere from Gmail to
 *  Outlook 2016.
 *
 *  Only runs for the skill_radar_envoye transition: other transitions'
 *  links stay as normal hyperlinks. */
function promoteCtaLink(html: string, statut: string): string {
    if (statut !== 'skill_radar_envoye')
        return html;
    const ctaPatterns = /(Commencer l['’]évaluation|Compléter mon Skill Radar|Démarrer l['’]auto[- ]évaluation)/i;
    const anchorRe = /<a\s+href="([^"]+)"\s*>([^<]+)<\/a>/i;
    return html.replace(anchorRe, (match, href: string, text: string) => {
        if (!ctaPatterns.test(text))
            return match;
        const cleanText = text.trim();
        return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto;">
  <tr>
    <td align="center" bgcolor="#2563eb" style="background-color:#2563eb;border-radius:8px;">
      <a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;color:#ffffff;background-color:#2563eb;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${cleanText}</a>
    </td>
  </tr>
</table>`;
    });
}
export async function renderTransitionEmail(opts: {
    candidateName: string;
    role: string;
    statut: string;
    notes?: string;
    customBody?: string;
    includeReasonInEmail?: boolean;
    evaluationUrl?: string;
}): Promise<{
    subject: string;
    html: string;
} | null> {
    if (opts.customBody) {
        const rawHtml = await marked.parse(opts.customBody);
        const cleanHtml = sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
        // Promote the CTA link into a proper button. The recruiter's editable
        // body renders via markdown → `<a>` is a plain hyperlink and the
        // sanitizer strips style attributes, so we can't pre-style the anchor.
        // Post-process: find anchors whose text looks like a CTA and wrap them
        // in a table-row with inline styles (the only thing email clients can
        // be trusted to respect). Table layout is deliberate — Outlook ignores
        // padding on divs.
        const withCta = promoteCtaLink(cleanHtml, opts.statut);
        const html = await wrapInEmailLayout(withCta);
        const template = getEmailTemplate(opts.statut, {
            candidateName: opts.candidateName,
            role: opts.role,
            notes: opts.notes,
            evaluationUrl: opts.evaluationUrl,
        });
        const subject = template?.subject ?? `${opts.role} — SINAPSE`;
        return { subject, html };
    }
    const defaultEmail = await buildDefaultHtml(opts.statut, {
        candidateName: opts.candidateName,
        role: opts.role,
        notes: opts.notes,
        includeReasonInEmail: opts.includeReasonInEmail,
        evaluationUrl: opts.evaluationUrl,
    });
    if (!defaultEmail)
        return null;
    return defaultEmail;
}
export async function sendTransitionEmail(opts: {
    to: string;
    candidateName: string;
    role: string;
    statut: string;
    notes?: string;
    customBody?: string;
    includeReasonInEmail?: boolean;
    evaluationUrl?: string;
    /** ISO-8601 timestamp. If provided, Resend holds the email until then,
     *  and we can cancel via resend.emails.cancel(id) before it fires. */
    scheduledAt?: string;
}): Promise<{
    messageId?: string;
    sent: boolean;
    scheduled?: boolean;
}> {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[EMAIL] RESEND_API_KEY not set — skipping email');
        return { sent: false };
    }
    const rendered = await renderTransitionEmail(opts);
    if (!rendered) {
        console.warn(`[EMAIL] No template for statut "${opts.statut}" — skipping`);
        return { sent: false };
    }
    const { subject, html } = rendered;
    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: opts.to,
            subject,
            html,
            attachments: maybeLogoAttachment(html),
            ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}),
        });
        if (error) {
            console.error(`[EMAIL] Transition email (${opts.statut}) send failed`);
            return { sent: false };
        }
        if (opts.scheduledAt) {
            console.log(`[EMAIL] Transition email (${opts.statut}) scheduled for ${opts.scheduledAt} (id: ${data?.id})`);
            return { messageId: data?.id, sent: true, scheduled: true };
        }
        console.log(`[EMAIL] Transition email (${opts.statut}) sent (id: ${data?.id})`);
        return { messageId: data?.id, sent: true };
    }
    catch {
        console.error(`[EMAIL] Failed to send transition email (${opts.statut})`);
        return { sent: false };
    }
}
/** Cancel a scheduled email that Resend has accepted but not yet sent.
 *  Returns true on success, false on failure.
 *
 *  Fail-closed in production: if RESEND_API_KEY is unset we return false
 *  (NOT true). Otherwise a misconfigured prod redeploy would mark local
 *  cancellations as successful while Resend keeps sending the queued mail.
 *  In test (NODE_ENV=test or VITEST=true), we no-op true so unit tests can
 *  exercise the happy path without mocking the Resend client at every call. */
export async function cancelScheduledEmail(messageId: string): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
        const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
        if (isTest) {
            return true;
        }
        console.error('[EMAIL] RESEND_API_KEY not set — cannot cancel scheduled email (failing closed)');
        return false;
    }
    try {
        const { error } = await resend.emails.cancel(messageId);
        if (error) {
            console.error(`[EMAIL] Failed to cancel scheduled email ${messageId}: ${error.message}`);
            return false;
        }
        console.log(`[EMAIL] Cancelled scheduled email ${messageId}`);
        return true;
    }
    catch (err) {
        console.error(`[EMAIL] Exception cancelling scheduled email ${messageId}: ${(err as Error).message}`);
        return false;
    }
}
function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
