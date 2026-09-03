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
    };
    if (input.reasoningEffort) {
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
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? '';
    return {
      text: content,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens
          }
        : undefined,
      model: input.model,
      latencyMs: Date.now() - started
    };
  }
}


