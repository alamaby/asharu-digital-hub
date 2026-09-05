import type { ChatInput, ChatOutput, LLMProvider, ProviderSlug } from '../types';
import { LLMHttpError } from '../types';

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    public readonly slug: ProviderSlug,
    private baseUrl: string
  ) {}

  async chat(input: ChatInput, apiKey: string): Promise<Omit<ChatOutput, 'keyId' | 'provider'>> {
    const started = Date.now();
    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens,
      response_format: { type: 'json_object' }
    };    if (input.reasoningEffort) {
      (body as Record<string, unknown>).reasoning_effort = input.reasoningEffort;
      // Compat: some routers use `reasoning: { effort: "max" }`
      (body as Record<string, unknown>).reasoning = { effort: input.reasoningEffort };
      // Also include `extra_body` style for OpenRouter-compatible gateways
      (body as Record<string, unknown>).extra_body = { reasoning: { effort: input.reasoningEffort } };
    }
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMHttpError(res.status, `LLM ${this.slug} ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string } | string>;
          tool_calls?: Array<{ function?: { arguments?: string; name?: string } }>;
          reasoning_content?: string;
        };
        finish_reason?: string;
        text?: string;
      }>;
      usage?: Record<string, unknown>;
    };
    const choice = json.choices?.[0];
    const msg = choice?.message;
    const content = extractMessageText(msg) || choice?.text || '';
    const finishReason = choice?.finish_reason ?? null;
    return {
      text: content,
      usage: normalizeUsage(json.usage),
      model: input.model,
      latencyMs: Date.now() - started,
      finishReason,
      rawPreview: content ? null : JSON.stringify(json).slice(0, 2000)
    };
  }
}

/** Accept snake_case, camelCase, and short aliases from various gateways. */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function normalizeUsage(u: Record<string, unknown> | undefined):
  | { promptTokens: number; completionTokens: number; totalTokens?: number }
  | undefined {
  if (!u) return undefined;
  const prompt = num(u.prompt_tokens) ?? num(u.promptTokens) ?? num(u.input_tokens) ?? num(u.prompt_eval_count);
  const completion =
    num(u.completion_tokens) ?? num(u.completionTokens) ?? num(u.output_tokens) ?? num(u.eval_count);
  const total = num(u.total_tokens) ?? num(u.totalTokens);
  if (prompt === undefined && completion === undefined && total === undefined) return undefined;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: total
  };
}

/**
 * Extract usable text from OpenAI-compatible message shapes.
 * Order: string content → content parts[] → tool_calls args → reasoning_content
 * (last resort, some reasoning routers put JSON there) → ''.
 */
function extractMessageText(
  msg:
    | {
        content?: string | Array<{ type?: string; text?: string } | string>;
        tool_calls?: Array<{ function?: { arguments?: string } }>;
        reasoning_content?: string;
      }
    | undefined
): string {
  if (!msg) return '';
  if (typeof msg.content === 'string' && msg.content.trim()) return msg.content;
  if (Array.isArray(msg.content)) {
    const joined = msg.content
      .map((p) => (typeof p === 'string' ? p : (p.text ?? '')))
      .join('')
      .trim();
    if (joined) return joined;
  }
  const toolArgs = msg.tool_calls?.[0]?.function?.arguments;
  if (typeof toolArgs === 'string' && toolArgs.trim()) return toolArgs;
  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) {
    const m = msg.reasoning_content.match(/\{[\s\S]*\}/);
    if (m) return m[0];
  }
  return '';
}


