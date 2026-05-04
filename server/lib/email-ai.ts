import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { AI_EMAIL_TOOL, validateAiEmailDraft, type AiEmailDraft } from '../emails/ai-schema.js';
/**
 * Generate a draft email body for a candidate-facing transition. Uses Anthropic's
 * tool-use mode to enforce the schema — the LLM CANNOT return prose outside the
 * tool_use payload.
 *
 * Cost: ~€0.003 per call with claude-haiku. Recruiter regenerates rarely.
 *
 * Recruiter's edits to the draft are NOT fed back into any training pipeline
 * (per the data retention ADR). The draft + the final body are stored on the
 * candidature_events row when the email actually sends.
 */
const PROMPT_VERSION = 1;
let SYSTEM_PROMPT_CACHE: string | null = null;
function loadSystemPrompt(): string {
    if (SYSTEM_PROMPT_CACHE)
        return SYSTEM_PROMPT_CACHE;
    const promptPath = path.join(process.cwd(), 'server/prompts/email-generation.md');
    SYSTEM_PROMPT_CACHE = fs.readFileSync(promptPath, 'utf-8');
    return SYSTEM_PROMPT_CACHE;
}
const STATUT_CONTEXT: Record<string, string> = {
    preselectionne: 'Vous (le recruteur) souhaitez confirmer la présélection du candidat.',
    skill_radar_envoye: 'Vous invitez le candidat à compléter son auto-évaluation Skill Radar.',
    entretien_1: 'Vous proposez un premier entretien (BENOIT + SAVALLE) avec prise de rendez-vous via https://calendly.com/guillaume-benoit-sinapse/30min. Nouvelle-Calédonie: créneau autour de midi; France métropolitaine: créneau en soirée.',
    aboro: 'Vous proposez le test de personnalité Âboro (payant, optionnel).',
    entretien_2: 'Vous proposez un deuxième entretien avec prise de rendez-vous via https://calendly.com/guillaume-benoit-sinapse/30min. Nouvelle-Calédonie: créneau autour de midi; France métropolitaine: créneau en soirée.',
    proposition: 'Vous annoncez qu’une proposition contractuelle va arriver.',
    embauche: 'Vous félicitez le candidat pour son recrutement.',
    refuse: 'Vous déclinez la candidature avec gratitude.',
};
export interface GenerateAiEmailParams {
    candidateName: string;
    role: string;
    statut: string;
    contextNote?: string;
    refuseReason?: string;
    currentBody?: string;
    instruction?: string;
}
export interface GenerateAiEmailResult {
    draft: AiEmailDraft;
    promptVersion: number;
    modelVersion: string;
    inputTokens: number;
    outputTokens: number;
}
export async function generateAiEmailDraft(params: GenerateAiEmailParams): Promise<GenerateAiEmailResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        throw new Error('ANTHROPIC_API_KEY non configurée');
    const client = new Anthropic({ apiKey });
    const systemPrompt = loadSystemPrompt();
    const statutContext = STATUT_CONTEXT[params.statut] ?? `Statut: ${params.statut}`;
    const hasModifyInput = Boolean(params.currentBody?.trim() && params.instruction?.trim());
    const userPrompt = [
        `Candidat: ${params.candidateName}`,
        `Poste: ${params.role}`,
        `Statut: ${params.statut} — ${statutContext}`,
        params.contextNote ? `Contexte additionnel du recruteur: ${params.contextNote}` : null,
        params.refuseReason && params.statut === 'refuse' ? `Motif du refus (à intégrer respectueusement): ${params.refuseReason}` : null,
        hasModifyInput ? `\nBrouillon actuel du recruteur (Markdown) :\n<<<\n${params.currentBody!.trim()}\n>>>` : null,
        hasModifyInput ? `\nDemande du recruteur (à appliquer au brouillon ci-dessus) : ${params.instruction!.trim()}` : null,
        hasModifyInput
            ? '\nRéécris le brouillon en appliquant fidèlement la demande, tout en respectant le ton et les contraintes du système. Conserve les informations factuelles (nom, poste), n’invente rien de nouveau. Sors uniquement via submit_email_draft.'
            : '\nRédige le brouillon en utilisant l’outil submit_email_draft.',
    ].filter(Boolean).join('\n');
    const model = 'claude-haiku-4-5-20251001';
    const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: [AI_EMAIL_TOOL],
        tool_choice: { type: 'tool', name: AI_EMAIL_TOOL.name },
        messages: [{ role: 'user', content: userPrompt }],
    });
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('AI email: no tool_use in response');
    }
    const draft = validateAiEmailDraft(toolUse.input);
    return {
        draft,
        promptVersion: PROMPT_VERSION,
        modelVersion: model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
    };
}
