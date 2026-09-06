import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixazoImageAdapter } from './providers/pixazo';
import { CloudflareImageAdapter } from './providers/cloudflare';
import { PollinationsImageAdapter } from './providers/pollinations';
import { GeminiImageAdapter } from './providers/gemini';
import { BynaraImageAdapter } from './providers/bynara';
import { ImageHttpError } from './types';
import { isHttpsUrl, base64ToBytes } from './providers/base';
import { buildImagePromptMessages, parseImagePrompt } from './prompt';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

const B64 = Buffer.from('fake-bytes').toString('base64');

describe('isHttpsUrl / base64ToBytes', () => {
  it('accepts https only', () => {
    expect(isHttpsUrl('https://x.test/a.png')).toBe(true);
    expect(isHttpsUrl('http://x.test/a.png')).toBe(false);
    expect(isHttpsUrl('/relative/path')).toBe(false);
  });
  it('decodes base64', () => {
    expect(Buffer.from(base64ToBytes(B64)).toString()).toBe('fake-bytes');
    expect(() => base64ToBytes('!!!')).toThrow();
  });
});

describe('PixazoImageAdapter', () => {
  it('parses flux output URL + sends subscription key', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ output: 'https://cdn.test/img.png', request_id: 'r1' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new PixazoImageAdapter({ baseUrl: 'https://gateway.pixazo.ai/flux-1-schnell/v1/getData', model: 'flux-1-schnell' }, 'k1');
    const result = await adapter.generateImage({ prompt: 'sticky pan' });
    expect(result.imageUrl).toBe('https://cdn.test/img.png');
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { headers: Record<string, string>; body: string };
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('k1');
    expect(JSON.parse(init.body).num_steps).toBe(4);
  });
  it('rejects non-https output', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ output: 'http://x.test/a.png' })));
    const adapter = new PixazoImageAdapter({ baseUrl: 'https://gateway.pixazo.ai/flux-1-schnell/v1/getData', model: 'flux-1-schnell' }, 'k');
    await expect(adapter.generateImage({ prompt: 'x' })).rejects.toThrow(/https output/);
  });
  it('maps 429 to ImageHttpError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 429)));
    const adapter = new PixazoImageAdapter({ baseUrl: 'https://gateway.pixazo.ai/flux-1-schnell/v1/getData', model: 'flux-1-schnell' }, 'k');
    const err = await adapter.generateImage({ prompt: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ImageHttpError);
    expect((err as ImageHttpError).status).toBe(429);
  });
});

describe('CloudflareImageAdapter', () => {
  it('decodes result.image base64 + requires account_id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', model: '@cf/black-forest-labs/flux-1-schnell', accountId: 'acc1' },
      'tok'
    );
    const result = await adapter.generateImage({ prompt: 'cat' });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('fake-bytes');
    const calls = fetchMock.mock.calls as unknown[][];
    expect(calls[0]?.[0] as string).toContain('/accounts/acc1/ai/v1/run/@cf/black-forest-labs/flux-1-schnell');
    expect(() => new CloudflareImageAdapter({ baseUrl: 'https://x.test', model: 'm', accountId: '' }, 't')).toThrow(/account_id/);
  });
});

describe('PollinationsImageAdapter', () => {
  it('parses b64_json', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ created: 1, data: [{ b64_json: B64 }] })));
    const adapter = new PollinationsImageAdapter({ baseUrl: 'https://gen.pollinations.ai/v1', model: 'flux' }, 'k');
    const result = await adapter.generateImage({ prompt: 'sunset' });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('fake-bytes');
  });
  it('accepts https url', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [{ url: 'https://img.test/a.png' }] })));
    const adapter = new PollinationsImageAdapter({ baseUrl: 'https://gen.pollinations.ai/v1', model: 'flux' }, 'k');
    const result = await adapter.generateImage({ prompt: 'sunset' });
    expect(result.imageUrl).toBe('https://img.test/a.png');
  });
});

describe('GeminiImageAdapter', () => {
  it('extracts inlineData part + sends x-goog-api-key', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: B64 } }] } }] })
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GeminiImageAdapter({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.1-flash-lite-image' }, 'gk');
    const result = await adapter.generateImage({ prompt: 'pan' });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('fake-bytes');
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { headers: Record<string, string>; body: string };
    expect(init.headers['x-goog-api-key']).toBe('gk');
    expect(JSON.parse(init.body).generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
  });
  it('throws when no image part', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] })));
    const adapter = new GeminiImageAdapter({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.1-flash-lite-image' }, 'gk');
    await expect(adapter.generateImage({ prompt: 'x' })).rejects.toThrow(/inlineData/);
  });
});

describe('BynaraImageAdapter', () => {
  it('parses b64_json + appends Avoid negative', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ b64_json: B64, revised_prompt: 'rev' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BynaraImageAdapter({ baseUrl: 'https://api-images.bynara.id/v1', model: 'agnes-image-2.1-flash' }, 'bk');
    const result = await adapter.generateImage({ prompt: 'pan', negativePrompt: 'text' });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('fake-bytes');
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { headers: Record<string, string>; body: string };
    expect(init.headers['Authorization']).toBe('Bearer bk');
    expect(JSON.parse(init.body).prompt).toContain('Avoid: text');
  });
  it('rejects non-integer seed', async () => {
    const adapter = new BynaraImageAdapter({ baseUrl: 'https://api-images.bynara.id/v1', model: 'agnes-image-2.1-flash' }, 'bk');
    await expect(adapter.generateImage({ prompt: 'x', seed: 1.5 })).rejects.toThrow(/integer/);
  });
});

describe('image_prompt builder/parser', () => {
  it('builds bilingual prompt + parses JSON with fence', () => {
    const { system, user } = buildImagePromptMessages({ mainId: 'panci lengket', mainEn: 'sticky pan' });
    expect(system).toContain('JSON ONLY');
    expect(user).toContain('sticky pan');
    const parsed = parseImagePrompt('```json\n{"image_prompt": "sticky frying pan close-up", "negative_prompt": "no text"}\n```');
    expect(parsed.image_prompt).toBe('sticky frying pan close-up');
    expect(parsed.negative_prompt).toBe('no text');
  });
  it('rejects missing image_prompt', () => {
    expect(() => parseImagePrompt('{"foo": 1}')).toThrow(/image_prompt/);
    expect(() => parseImagePrompt('no json here')).toThrow();
  });
});
