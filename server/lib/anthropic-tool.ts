import Anthropic from '@anthropic-ai/sdk';
/**
 * Thin wrapper around Anthropic tool-use for structured JSON extraction.
 *
 * Callers provide a single tool schema + system/user prompts. The wrapper
 * handles the ceremony: constructing the `tools` array, forcing tool choice,
 * finding the tool_use block in the response, and returning the raw input
 * (validation/normalization stays with the caller — we don't want to
 * couple the wrapper to any particular shape).
 *
 * Returns `null` when the model either doesn't emit a tool_use block or
 * emits a block with missing input. The caller decides whether that is
 * recoverable (retry, fallback) or terminal.
 *
 * This wrapper is used by:
 *   - server/lib/cv-extraction.ts  (per-category skill extraction)
 *   - server/lib/cv-profile-extraction.ts  (structured profile, Phase 4)
 *   - server/lib/cv-multipass.ts  (critique + reconcile, Phase 7)
 */
export interface AnthropicToolCall {
    model: string;
    maxTokens?: number;
    temperature?: number;
    system: string;
    user: string;
    tool: {
        name: string;
        description: string;
        inputSchema: Anthropic.Messages.Tool['input_schema'];
    };
    /** Pre-constructed Anthropic client. Callers can share one or create per-call. */
    client?: Anthropic;
}
export interface AnthropicToolResult<TInput> {
    input: TInput;
    inputTokens: number | null;
    outputTokens: number | null;
    model: string;
}
export async function callAnthropicTool<TInput = Record<string, unknown>>(opts: AnthropicToolCall): Promise<AnthropicToolResult<TInput> | null> {
    const client = opts.client ?? new Anthropic();
    const message = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0,
        tools: [{
                name: opts.tool.name,
                description: opts.tool.description,
                input_schema: opts.tool.inputSchema,
            }],
        tool_choice: { type: 'tool', name: opts.tool.name },
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
    });
    const toolBlock = message.content.find(b => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use')
        return null;
    if (!toolBlock.input)
        return null;
    return {
        input: toolBlock.input as TInput,
        inputTokens: message.usage?.input_tokens ?? null,
        outputTokens: message.usage?.output_tokens ?? null,
        model: message.model ?? opts.model,
    };
}
