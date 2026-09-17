import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCioraProvider } from './ciora';

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
  choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 }
};

describe('createCioraProvider', () => {
  it('POSTs to https://ciora.id/v1/chat/completions with Bearer auth', async () => {
    const fetchMock = vi.fn(async () => okResponse(baseBody));
    vi.stubGlobal('fetch', fetchMock);
    const p = createCioraProvider();
    const out = await p.chat(
      { model: 'nex-agi/nex-n2.5', messages: [{ role: 'user', content: 'hi' }] },
      'test-key'
    );
    expect(p.slug).toBe('ciora');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://ciora.id/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(out.text).toBe('{"ok":true}');
  });

  it('forwards reasoning_effort max', async () => {
    const fetchMock = vi.fn(async () => okResponse(baseBody));
    vi.stubGlobal('fetch', fetchMock);
    const p = createCioraProvider();
    await p.chat(
      { model: 'qwen/qwen3.6-35b-a3b', messages: [{ role: 'user', content: 'hi' }], reasoningEffort: 'max' },
      'k'
    );
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const sent = JSON.parse(init.body) as Record<string, unknown>;
    expect(sent.reasoning_effort).toBe('max');
  });

  it('respects a custom baseUrl', async () => {
    const fetchMock = vi.fn(async () => okResponse(baseBody));
    vi.stubGlobal('fetch', fetchMock);
    const p = createCioraProvider('https://example.test/v1/');
    await p.chat({ model: 'ciora-ai-free', messages: [{ role: 'user', content: 'hi' }] }, 'k');
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://example.test/v1/chat/completions');
  });
});
