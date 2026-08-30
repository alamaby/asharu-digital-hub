import type { ChatInput, ChatOutput, LLMProvider } from '../types';

export class CloudflareProvider implements LLMProvider {
  readonly slug = 'cloudflare' as const;
  constructor(
    private baseUrl = 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    private accountId = ''
  ) {}

  async chat(input: ChatInput, apiKey: string): Promise<Omit<ChatOutput, 'keyId' | 'provider'>> {
    const started = Date.now();
    // Cloudflare Workers AI: POST /accounts/{account_id}/ai/run/{model}
    // The account id is provider config (identifier, not secret); the API
    // token is the Vault-backed apiKey. Model e.g. "@cf/meta/llama-3.1-8b-instruct".
    if (!this.accountId) throw new Error('Cloudflare provider missing account_id config');
    const url = this.baseUrl
      .replace('{account_id}', encodeURIComponent(this.accountId))
      .replace(/\/$/, '') + `/run/${encodeURIComponent(input.model)}`;
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
