import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './gemini';

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

const baseBody = {
  candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 }
};

describe('GeminiProvider thinkingConfig', () => {
  it('sends thinkingLevel HIGH for max effort', async () => {
    const fetchMock = vi.fn(async () => okResponse(baseBody));
    vi.stubGlobal('fetch', fetchMock);
    const p = new GeminiProvider('https://example.test/v1beta');
    await p.chat({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }], reasoningEffort: 'max' }, 'k');
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const sent = JSON.parse(init.body) as { generationConfig: Record<string, unknown> };
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'HIGH' });
  });

  it('omits thinkingConfig without reasoning', async () => {
    const fetchMock = vi.fn(async () => okResponse(baseBody));
    vi.stubGlobal('fetch', fetchMock);
    const p = new GeminiProvider('https://example.test/v1beta');
    await p.chat({ model: 'gemini-3.5-flash-lite', messages: [{ role: 'user', content: 'hi' }] }, 'k');
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const sent = JSON.parse(init.body) as { generationConfig: Record<string, unknown> };
    expect('thinkingConfig' in sent.generationConfig).toBe(false);
  });

  it('explicit budget wins over effort', async () => {
    const fetchMock = vi.fn(async () => okResponse(baseBody));
    vi.stubGlobal('fetch', fetchMock);
    const p = new GeminiProvider('https://example.test/v1beta');
    await p.chat(
      { model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }], reasoningEffort: 'max', thinkingBudget: 1024 },
      'k'
    );
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const sent = JSON.parse(init.body) as { generationConfig: Record<string, unknown> };
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
  });
});
