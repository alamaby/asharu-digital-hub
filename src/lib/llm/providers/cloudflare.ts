import type { ChatInput, ChatOutput, LLMProvider } from '../types';

export class CloudflareProvider implements LLMProvider {
  readonly slug = 'cloudflare' as const;
  constructor(private baseUrl = 'https://api.cloudflare.com/client/v4') {}

  async chat(input: ChatInput, apiKey: string): Promise<Omit<ChatOutput, 'keyId' | 'provider'>> {
    const started = Date.now();
    // Cloudflare Workers AI: POST /accounts/{id}/ai/run/{model}
    // For MVP we expect model like "@cf/meta/llama-3.1-8b-instruct"
    // apiKey is expected to be "CF_API_TOKEN" and account_id via env or baseUrl param.
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
    const model = input.model;
    const url = `${this.baseUrl.replace(/\/$/, '')}/accounts/${accountId}/ai/run/${encodeURIComponent(model)}`;
    const prompt = input.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        messages: input.messages,
        prompt
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM cloudflare ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      result?: { response?: string };
      response?: string;
    };
    const content = json.result?.response ?? json.response ?? '';
    return {
      text: typeof content === 'string' ? content : JSON.stringify(content),
      model: input.model,
      latencyMs: Date.now() - started
    };
  }
}
