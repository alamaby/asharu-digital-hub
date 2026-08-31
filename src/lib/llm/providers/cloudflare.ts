import type { ChatInput, ChatOutput, LLMProvider } from '../types';
import { LLMHttpError } from '../types';

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
    // Model ids contain slashes (e.g. @cf/meta/llama-3.1-8b-instruct) that are
    // part of the path — must NOT be percent-encoded.
    const url = this.baseUrl
      .replace('{account_id}', encodeURIComponent(this.accountId))
      .replace(/\/$/, '') + `/run/${input.model}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      // Workers AI chat models accept `messages` only; sending `prompt` too
      // violates the API's oneOf schema.
      body: JSON.stringify({
        messages: input.messages,
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.7
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMHttpError(res.status, `LLM cloudflare ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      result?: { response?: string; choices?: { message?: { content?: string } }[] };
      response?: string;
    };
    // Workers AI returns OpenAI-style choices for chat models, plus a legacy
    // `result.response` string for text models.
    const content =
      json.result?.choices?.[0]?.message?.content ?? json.result?.response ?? json.response ?? '';
    return {
      text: typeof content === 'string' ? content : JSON.stringify(content),
      model: input.model,
      latencyMs: Date.now() - started
    };
  }
}
