import type { ChatInput, ChatOutput, LLMProvider, ProviderSlug } from '../types';

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    public readonly slug: ProviderSlug,
    private baseUrl: string
  ) {}

  async chat(input: ChatInput, apiKey: string): Promise<Omit<ChatOutput, 'keyId' | 'provider'>> {
    const started = Date.now();
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens,
        response_format: { type: 'json_object' }
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM ${this.slug} ${res.status}: ${text.slice(0, 500)}`);
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


