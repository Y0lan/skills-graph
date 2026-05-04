import { getDb } from './db.js';
/**
 * Outbound + transition email helpers shared across the recruitment
 * route family. Lifted out of recruitment.ts so the post-split
 * `transitions.ts` and `admin.ts` submodules don\'t fork copies.
 * Codex post-plan P1 #4.
 */
/**
 * System prompt for the AI email draft endpoint
 * (`POST /api/recruitment/ai-email-draft`). Sets the recruiter persona
 * + guards against hallucinating candidate details.
 */
export const AI_EMAIL_SYSTEM_PROMPT = `Tu es un recruteur professionnel chez SINAPSE, une ESN basée en Nouvelle-Calédonie. Rédige des emails professionnels en français. Sois chaleureux mais professionnel. Ne fabrique pas de détails sur le candidat qui ne sont pas dans le contexte fourni.

Réponds au format suivant exactement :
SUJET: <sujet de l'email>
CORPS:
<corps de l'email en texte simple>`;
/**
 * Replace email addresses + phone numbers in candidate-supplied text
 * with placeholder tokens before passing to the LLM. The candidate
 * context is auto-truncated to 4000 chars in `getEmailPrompt`, so
 * combined with this strip the model can\'t exfiltrate PII even if
 * the recruiter pastes a full CV in by accident.
 */
export function stripPii(text: string | undefined | null): string {
    if (!text)
        return '';
    return text
        .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email masqué]')
        .replace(/(\+?\d[\d\s.-]{7,})/g, '[téléphone masqué]');
}
/**
 * Build the per-statut email prompt fed to the AI draft endpoint.
 * Branches by statut so each transition has the right tone (refus
 * empathique, embauche enthousiaste, etc.) without a giant template
 * tree in the route handler.
 */
export function getEmailPrompt(statut: string, candidateName: string, role: string, candidateContext?: string): string {
    const contextBlock = candidateContext
        ? `\n\nContexte candidat :\n${stripPii(candidateContext).slice(0, 4000)}`
        : '';
    switch (statut) {
        case 'refuse':
            return `Rédige un email de refus poli pour ${candidateName}, candidat(e) au poste de ${role}. Remercie pour le temps consacré, sois empathique mais clair.${contextBlock}`;
        case 'embauche':
            return `Rédige un email de bienvenue/offre pour ${candidateName}, recruté(e) au poste de ${role}. Félicite et montre l'enthousiasme de l'équipe.${contextBlock}`;
        case 'proposition':
            return `Rédige un email de proposition d'embauche pour ${candidateName} au poste de ${role}. Exprime l'intérêt et invite à discuter des modalités.${contextBlock}`;
        case 'preselectionne':
            return `Rédige un email informant ${candidateName} que sa candidature au poste de ${role} a été présélectionnée. Bonne nouvelle, prochaines étapes à venir.${contextBlock}`;
        case 'entretien_1':
        case 'entretien_2':
            return `Rédige un email de convocation à un entretien pour ${candidateName}, candidat(e) au poste de ${role}. Invite à choisir un créneau sur https://calendly.com/guillaume-benoit-sinapse/30min. Précise que les personnes en Nouvelle-Calédonie doivent privilégier un créneau autour de midi, et les personnes en France métropolitaine un créneau en soirée.${contextBlock}`;
        default:
            return `Rédige un email de mise à jour de statut pour ${candidateName}, candidat(e) au poste de ${role}. Le statut passe à "${statut}".${contextBlock}`;
    }
}
/**
 * Resend deliverability webhook helper — looks up the originating
 * `email_sent` or `email_scheduled` event by messageId, then inserts
 * a deliverability event (open / click / delivered / bounced /
 * delayed / failed) with idempotency keyed on messageId in notes.
 *
 * Returns silently on any error or missing data so the webhook
 * handler can ack 200 to Resend regardless.
 */
export async function recordDeliverabilityEvent(payload: Record<string, unknown>, eventType: 'email_clicked' | 'email_delivered' | 'email_complained' | 'email_delay' | 'email_failed', buildNotes: (emailId: string) => string): Promise<void> {
    try {
        const data = payload.data as Record<string, unknown>;
        const emailId = data.email_id as string | undefined;
        if (!emailId)
            return;
        const found = await getDb().prepare(`
      SELECT ce.candidature_id
      FROM candidature_events ce
      WHERE ce.type IN ('email_sent', 'email_scheduled')
      AND ce.email_snapshot->>'messageId' = ?
    `).get(emailId) as {
            candidature_id: string;
        } | undefined;
        if (!found)
            return;
        const existing = await getDb().prepare(`
      SELECT id FROM candidature_events
      WHERE candidature_id = ? AND type = ?
      AND notes LIKE ?
    `).get(found.candidature_id, eventType, `%${emailId}%`) as {
            id: number;
        } | undefined;
        if (!existing) {
            await getDb().prepare(`
        INSERT INTO candidature_events (candidature_id, type, notes, created_by)
        VALUES (?, ?, ?, 'system')
      `).run(found.candidature_id, eventType, buildNotes(emailId));
            console.log(`[Webhook] Recorded ${eventType} for candidature ${found.candidature_id}`);
        }
    }
    catch {
        console.error(`[WEBHOOK] Error processing ${eventType} event`);
    }
}
