import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareProvider } from './cloudflare';

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body
  } as Response;
}

const BASE = 'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1';

describe('CloudflareProvider usage', () => {
  it('mem-parse result.usage (snake_case) ke metrik', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okResponse({
          result: {
            response: 'Halo',
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
          },
          success: true
        })
      )
    );
    const p = new CloudflareProvider(BASE, 'abc123');
    const out = await p.chat(
      { model: '@cf/meta/llama-3.1-8b-instruct', messages: [{ role: 'user', content: 'hai' }] },
      'k'
    );
    expect(out.text).toBe('Halo');
    expect(out.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
  });

  it('tanpa usage = undefined (UI tampil "-", bukan 0 palsu)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse({ result: { response: 'Halo' }, success: true }))
    );
    const p = new CloudflareProvider(BASE, 'abc123');
    const out = await p.chat(
      { model: '@cf/meta/llama-3.1-8b-instruct', messages: [{ role: 'user', content: 'hai' }] },
      'k'
    );
    expect(out.usage).toBeUndefined();
  });

  it('toleran camelCase di top-level usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okResponse({
          result: { choices: [{ message: { content: 'Hi' } }] },
          usage: { promptTokens: 3, completionTokens: 4 }
        })
      )
    );
    const p = new CloudflareProvider(BASE, 'abc123');
    const out = await p.chat(
      { model: '@cf/meta/llama-3.1-8b-instruct', messages: [{ role: 'user', content: 'hai' }] },
      'k'
    );
    expect(out.usage).toEqual({ promptTokens: 3, completionTokens: 4, totalTokens: undefined });
  });
});
