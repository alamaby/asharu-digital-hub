import type { ChatInput, ChatOutput, LLMProvider } from '../types';
import { LLMHttpError } from '../types';
import { buildThinkingConfig } from '../model-config';

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
    // Reasoning: read from llm_models.config (configurable by table).
    // thinking_level eksplisit > thinking_budget eksplisit > mapping effort.
    // Tanpa reasoning → jangan kirim thinkingConfig (hemat + aman utk varian lite).
    const thinkingConfig = buildThinkingConfig({
      reasoningEffort: input.reasoningEffort,
      thinkingBudget: input.thinkingBudget,
      thinkingLevel: input.thinkingLevel
    });
    const generationConfig: Record<string, unknown> = {
      temperature: input.temperature ?? 0.7,
      maxOutputTokens: input.maxTokens,
      responseMimeType: 'application/json'
    };
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        generationConfig
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMHttpError(res.status, `LLM gemini ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string; thought?: boolean }[] };
      }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        thoughtTokenCount?: number;
      };
    };
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    // Gabung semua part teks non-thought (respons bisa multi-part); part
    // thought hanya untuk forensik rawPreview, jangan cemari output.
    const textParts: string[] = [];
    const thoughtParts: string[] = [];
    for (const p of parts) {
      if (typeof p.text !== 'string' || p.text.length === 0) continue;
      if (p.thought) thoughtParts.push(p.text);
      else textParts.push(p.text);
    }
    const content = textParts.join('');
    const promptTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
    const thoughtTokens =
      json.usageMetadata?.thoughtsTokenCount ?? json.usageMetadata?.thoughtTokenCount ?? null;
    return {
      text: content,
      usage: json.usageMetadata
        ? {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens
          }
        : undefined,
      finishReason: candidate?.finishReason ?? null,
      thoughtTokens,
      rawPreview: content ? null : thoughtParts.join('').slice(0, 2000) || null,
      model: input.model,
      latencyMs: Date.now() - started
    };
  }
}
