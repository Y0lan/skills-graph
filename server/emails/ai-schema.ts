/**
 * Strict schema for AI-generated email bodies. The wrapper template (Item 17's
 * SinapseLayout) slots these four fields and discards anything else, so an
 * LLM hallucination outside the schema can never reach the candidate.
 */
export interface AiEmailDraft {
    subject: string;
    greeting: string;
    main_paragraph: string;
    call_to_action: string;
}
/** Anthropic tool definition for structured output. */
export const AI_EMAIL_TOOL = {
    name: 'submit_email_draft' as const,
    description: 'Submit the recruiter-facing draft of a candidate email body.',
    input_schema: {
        type: 'object' as const,
        properties: {
            subject: {
                type: 'string' as const,
                description: 'Email subject line, ≤80 characters, includes the role title.',
                maxLength: 80,
            },
            greeting: {
                type: 'string' as const,
                description: "First line, e.g. 'Bonjour Marie,'.",
                maxLength: 80,
            },
            main_paragraph: {
                type: 'string' as const,
                description: 'Body — one to three short sentences explaining the stage transition.',
                minLength: 30,
                maxLength: 800,
            },
            call_to_action: {
                type: 'string' as const,
                description: 'Single-sentence ask of the candidate (next step / availability / etc.).',
                minLength: 5,
                maxLength: 200,
            },
        },
        required: ['subject', 'greeting', 'main_paragraph', 'call_to_action'],
    },
};
/** Validate parsed tool input. Throws on schema drift. */
export function validateAiEmailDraft(raw: unknown): AiEmailDraft {
    if (!raw || typeof raw !== 'object')
        throw new Error('AI email: not an object');
    const r = raw as Record<string, unknown>;
    for (const k of ['subject', 'greeting', 'main_paragraph', 'call_to_action'] as const) {
        if (typeof r[k] !== 'string' || (r[k] as string).trim().length === 0) {
            throw new Error(`AI email: missing or empty field "${k}"`);
        }
    }
    if ((r.subject as string).length > 80)
        throw new Error('AI email: subject > 80 chars');
    return {
        subject: (r.subject as string).trim(),
        greeting: (r.greeting as string).trim(),
        main_paragraph: (r.main_paragraph as string).trim(),
        call_to_action: (r.call_to_action as string).trim(),
    };
}
/** Render an AiEmailDraft into the markdown body that renderTransitionEmail
 * accepts as customBody. The wrapper layout will format/sanitize it. */
export function draftToMarkdown(d: AiEmailDraft): string {
    return [
        d.greeting,
        '',
        d.main_paragraph,
        '',
        d.call_to_action,
    ].join('\n');
}
