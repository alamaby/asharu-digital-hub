import type { ChatInput, ChatOutput, LLMProvider } from '../types';
import { LLMHttpError } from '../types';

export class GeminiProvider implements LLMProvider {
  readonly slug = 'gemini' as const;
  constructor(private baseUrl = 'https://generativelanguage.googleapis.com/v1beta') {}

  async chat(input: ChatInput, apiKey: string): Promise<Omit<ChatOutput, 'keyId' | 'provider'>> {
    const started = Date.now();
    // Gemini generateContent expects different shape; we map to it.
    const contents = input.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : m.role,
      parts: [{ text: m.content }]
    }));
    const model = input.model.replace(/^gemini\//, '');
    // Key goes in the x-goog-api-key header, not the query string — URLs end
    // up in access logs far more often than headers do.
    const url = `${this.baseUrl.replace(/\/$/, '')}/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: input.temperature ?? 0.7,
          maxOutputTokens: input.maxTokens,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMHttpError(res.status, `LLM gemini ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const promptTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      text: content,
      usage: json.usageMetadata
        ? {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens
          }
        : undefined,
      model: input.model,
      latencyMs: Date.now() - started
    };
  }
}
