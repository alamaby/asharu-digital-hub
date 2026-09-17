import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixazoImageAdapter } from './providers/pixazo';
import { CloudflareImageAdapter } from './providers/cloudflare';
import { PollinationsImageAdapter } from './providers/pollinations';
import { GeminiImageAdapter } from './providers/gemini';
import { BynaraImageAdapter } from './providers/bynara';
import { ImageHttpError } from './types';
import {
  DEFAULT_IMG2IMG_STRENGTH,
  clampAutoParams,
  clampGuidance,
  clampImg2ImgDimension,
  clampImg2ImgSteps,
  clampImg2ImgStrength,
  clampRequestDimension,
  clampTextSteps,
  isFlux2Model,
  isImg2ImgModel,
  isLeonardoModel,
  isLucidModel,
  isPhoenixModel,
  modelDefaultParams,
  modelNegativeMode,
  modelRendersText,
  modelSupportsReference,
  resolveEffectiveAdvanced,
  stripDataUrlPrefix,
  stripNoTextClause
} from './types';
import { isHttpsUrl, base64ToBytes } from './providers/base';
import { buildImagePromptMessages, parseImagePrompt, validateImagePromptContradiction, mergeImageNegativePrompts } from './prompt';

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
  it('Flux: negative dilipat jadi klausa Avoid di prompt (bukan field negative_prompt)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', model: '@cf/black-forest-labs/flux-1-schnell', accountId: 'acc1' },
      'tok'
    );
    await adapter.generateImage({ prompt: 'cat', negativePrompt: 'blurry, text' });
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    // Skema Flux menolak properti tambahan → tidak boleh ada field ini (kasus 400 prod 12 Sep 2026).
    expect(body).not.toHaveProperty('negative_prompt');
    expect(body['prompt']).toBe('cat Avoid: blurry, text');
    expect(body['steps']).toBe(4);
  });
  it('Flux tanpa negative: prompt utuh + steps', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', model: '@cf/black-forest-labs/flux-1-schnell', accountId: 'acc1' },
      'tok'
    );
    await adapter.generateImage({ prompt: 'cat' });
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body['prompt']).toBe('cat');
    expect(body).not.toHaveProperty('negative_prompt');
  });
  it('SDXL tanpa referensi: text-to-image pakai num_steps + negative_prompt native', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai', model: '@cf/bytedance/stable-diffusion-xl-lightning', accountId: 'acc1' },
      'tok'
    );
    await adapter.generateImage({ prompt: 'cat', negativePrompt: 'blurry, text' });
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body['negative_prompt']).toBe('blurry, text');
    expect(body['num_steps']).toBe(10);
    expect(body).not.toHaveProperty('steps');
    expect(body['prompt']).toBe('cat');
  });
});

describe('CloudflareImageAdapter img2img', () => {
  const IMG2IMG = '@cf/runwayml/stable-diffusion-v1-5-img2img';
  const SDXL = '@cf/bytedance/stable-diffusion-xl-lightning';
  const cfg = { baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai', model: IMG2IMG, accountId: 'acc1' };

  it('mengirim image_b64 + strength + num_steps + dimensi aspek', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(cfg, 'tok');
    const result = await adapter.generateImage({
      prompt: 'tidy bedroom, warm light',
      referenceImageB64: `data:image/jpeg;base64,${B64}`,
      strength: 0.4,
      aspectRatio: '16:9'
    });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('fake-bytes');
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(String(calls[0]?.[0])).toContain(`/run/${IMG2IMG}`);
    expect(body['image_b64']).toBe(B64);
    expect(body['strength']).toBe(0.4);
    expect(body['num_steps']).toBe(10);
    expect(body['width']).toBe(1344);
    expect(body['height']).toBe(768);
    expect(result.metadata).toMatchObject({ model: IMG2IMG, strength: 0.4 });
  });

  it('menerima respons biner langsung (ReadableStream binding)', async () => {
    const bytes = Buffer.from('binary-png');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'image/png' }),
            json: async () => {
              throw new Error('not json');
            },
            text: async () => '',
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          }) as unknown as Response
      )
    );
    const adapter = new CloudflareImageAdapter({ ...cfg, model: SDXL }, 'tok');
    const result = await adapter.generateImage({ prompt: 'portrait', referenceImageB64: B64 });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('binary-png');
    expect(result.mimeType).toBe('image/png');
  });

  it('menolak reference untuk model Flux-1/Leonardo sebelum request (hemat key/kuota)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: 'https://x.test/ai', model: '@cf/black-forest-labs/flux-1-schnell', accountId: 'acc1' },
      'tok'
    );
    await expect(adapter.generateImage({ prompt: 'cat', referenceImageB64: B64 })).rejects.toThrow(
      /tidak mendukung image reference/
    );
    const leo = new CloudflareImageAdapter(
      { baseUrl: 'https://x.test/ai', model: '@cf/leonardo/phoenix-1.0', accountId: 'acc1' },
      'tok'
    );
    await expect(leo.generateImage({ prompt: 'cat', referenceImageB64: B64 })).rejects.toThrow(
      /tidak mendukung image reference/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clamp strength/steps/dimensi + kupas prefix data URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(cfg, 'tok');
    await adapter.generateImage({
      prompt: 'room',
      referenceImageB64: B64,
      strength: 9,
      numSteps: 99,
      width: 99999,
      height: 10
    });
    const init = (fetchMock.mock.calls as unknown[][])[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body['strength']).toBe(1);
    expect(body['num_steps']).toBe(20);
    expect(body['width']).toBe(2048);
    expect(body['height']).toBe(256);
  });
});

describe('CloudflareImageAdapter Leonardo', () => {
  const base = 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai';

  it('Phoenix: negative native + guidance + num_steps + dimensi + seed', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: base, model: '@cf/leonardo/phoenix-1.0', accountId: 'acc1' },
      'tok'
    );
    await adapter.generateImage({
      prompt: 'infographic poster',
      negativePrompt: 'blurry',
      guidance: 5,
      numSteps: 30,
      seed: 7,
      width: 1536,
      height: 1024
    });
    const init = (fetchMock.mock.calls as unknown[][])[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body['prompt']).toBe('infographic poster');
    expect(body['negative_prompt']).toBe('blurry');
    expect(body['guidance']).toBe(5);
    expect(body['num_steps']).toBe(30);
    expect(body).not.toHaveProperty('steps');
    expect(body['width']).toBe(1536);
    expect(body['height']).toBe(1024);
    expect(body['seed']).toBe(7);
  });

  it('Lucid: tanpa negative_prompt (lipat Avoid:) + kirim num_steps dan steps', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ image: B64 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: base, model: '@cf/leonardo/lucid-origin', accountId: 'acc1' },
      'tok'
    );
    const result = await adapter.generateImage({ prompt: 'product mockup', negativePrompt: 'blurry', numSteps: 22 });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('fake-bytes');
    const init = (fetchMock.mock.calls as unknown[][])[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('negative_prompt');
    expect(String(body['prompt'])).toContain('Avoid: blurry');
    expect(body['num_steps']).toBe(22);
    expect(body['steps']).toBe(22);
  });

  it('Phoenix menerima respons biner image/jpeg', async () => {
    const bytes = Buffer.from('phoenix-jpeg');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'image/jpeg' }),
            json: async () => {
              throw new Error('not json');
            },
            text: async () => '',
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          }) as unknown as Response
      )
    );
    const adapter = new CloudflareImageAdapter(
      { baseUrl: base, model: '@cf/leonardo/phoenix-1.0', accountId: 'acc1' },
      'tok'
    );
    const result = await adapter.generateImage({ prompt: 'poster' });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('phoenix-jpeg');
    expect(result.mimeType).toBe('image/jpeg');
  });
});

describe('CloudflareImageAdapter FLUX.2', () => {
  const base = 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai';

  it('text-to-image: FormData primary (tanpa Content-Type manual)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: base, model: '@cf/black-forest-labs/flux-2-klein-4b', accountId: 'acc1' },
      'tok'
    );
    await adapter.generateImage({ prompt: 'cat', negativePrompt: 'blurry', numSteps: 6, seed: 3 });
    const calls = fetchMock.mock.calls as unknown[][];
    expect(calls).toHaveLength(1);
    const init = calls[0]?.[1] as { headers: Record<string, string>; body: FormData };
    expect(init.headers).not.toHaveProperty('Content-Type');
    const form = init.body;
    expect(form.get('prompt')).toBe('cat Avoid: blurry');
    expect(form.get('steps')).toBe('6');
    expect(form.get('seed')).toBe('3');
  });

  it('fallback JSON minimal 1x khusus HTTP 400 (401 tidak di-fallback)', async () => {
    const badThenOk = vi
      .fn(async () => ({ ok: false, status: 400, text: async () => 'bad' }) as Response)
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' } as Response)
      .mockResolvedValueOnce(jsonResponse({ result: { image: B64 } }) as Response);
    vi.stubGlobal('fetch', badThenOk);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: base, model: '@cf/black-forest-labs/flux-2-dev', accountId: 'acc1' },
      'tok'
    );
    const result = await adapter.generateImage({ prompt: 'cat' });
    expect(Buffer.from(result.imageBytes!).toString()).toBe('fake-bytes');
    expect(badThenOk).toHaveBeenCalledTimes(2);
    const second = (badThenOk.mock.calls as unknown[][])[1]?.[1] as { headers: Record<string, string>; body: string };
    expect(second.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(second.body)).toMatchObject({ prompt: 'cat' });
    expect(result.metadata).toMatchObject({ transport: 'json-fallback' });

    const unauthorized = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'no' }) as Response);
    vi.stubGlobal('fetch', unauthorized);
    await expect(adapter.generateImage({ prompt: 'cat' })).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('transport=json: langsung JSON tanpa FormData; transport=multipart: tanpa fallback', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const jsonAdapter = new CloudflareImageAdapter(
      {
        baseUrl: base,
        model: '@cf/black-forest-labs/flux-2-klein-9b',
        accountId: 'acc1',
        modelConfig: { transport: 'json' }
      },
      'tok'
    );
    await jsonAdapter.generateImage({ prompt: 'cat', parameters: { transport: 'json' } });
    const init = (fetchMock.mock.calls as unknown[][])[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers['Content-Type']).toBe('application/json');

    const bad = vi.fn(async () => ({ ok: false, status: 400, text: async () => 'bad' }) as Response);
    vi.stubGlobal('fetch', bad);
    const strict = new CloudflareImageAdapter(
      { baseUrl: base, model: '@cf/black-forest-labs/flux-2-klein-9b', accountId: 'acc1' },
      'tok'
    );
    await expect(strict.generateImage({ prompt: 'cat', parameters: { transport: 'multipart' } })).rejects.toMatchObject({ status: 400 });
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('single-reference: part image + metadata reference=true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { image: B64 } }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudflareImageAdapter(
      { baseUrl: base, model: '@cf/black-forest-labs/flux-2-klein-4b', accountId: 'acc1' },
      'tok'
    );
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64').toString('base64');
    const result = await adapter.generateImage({ prompt: 'edit this', referenceImageB64: tinyPng, seed: 1 });
    const init = (fetchMock.mock.calls as unknown[][])[0]?.[1] as { body: FormData };
    const part = init.body.get('image');
    expect(part).toBeInstanceOf(Blob);
    expect(result.metadata).toMatchObject({ reference: true });
  });
});

describe('img2img helpers', () => {
  it('isImg2ImgModel hanya untuk 2 model SD fase 1 (Flux-2/Leonardo terpisah)', () => {
    expect(isImg2ImgModel('@cf/runwayml/stable-diffusion-v1-5-img2img')).toBe(true);
    expect(isImg2ImgModel('@cf/bytedance/stable-diffusion-xl-lightning')).toBe(true);
    expect(isImg2ImgModel('@cf/lykon/dreamshaper-8-lcm')).toBe(false);
    expect(isImg2ImgModel('@cf/black-forest-labs/flux-1-schnell')).toBe(false);
    expect(isImg2ImgModel('@cf/black-forest-labs/flux-2-klein-4b')).toBe(false);
    expect(isImg2ImgModel('@cf/leonardo/phoenix-1.0')).toBe(false);
  });
  it('detektor famili baru: Flux-2 / Leonardo / Phoenix / Lucid', () => {
    expect(isFlux2Model('@cf/black-forest-labs/flux-2-klein-4b')).toBe(true);
    expect(isFlux2Model('@cf/black-forest-labs/flux-2-klein-9b')).toBe(true);
    expect(isFlux2Model('@cf/black-forest-labs/flux-2-dev')).toBe(true);
    expect(isFlux2Model('@cf/black-forest-labs/flux-1-schnell')).toBe(false);
    expect(isLeonardoModel('@cf/leonardo/phoenix-1.0')).toBe(true);
    expect(isLeonardoModel('@cf/leonardo/lucid-origin')).toBe(true);
    expect(isLeonardoModel('@cf/black-forest-labs/flux-2-dev')).toBe(false);
    expect(isPhoenixModel('@cf/leonardo/phoenix-1.0')).toBe(true);
    expect(isPhoenixModel('@cf/leonardo/lucid-origin')).toBe(false);
    expect(isLucidModel('@cf/leonardo/lucid-origin')).toBe(true);
    expect(isLucidModel('@cf/leonardo/phoenix-1.0')).toBe(false);
  });
  it('modelSupportsReference: flag config menang atas daftar', () => {
    expect(modelSupportsReference({ model_id: 'flux-1-schnell', config: { supports_reference: true } })).toBe(true);
    expect(
      modelSupportsReference({ model_id: '@cf/runwayml/stable-diffusion-v1-5-img2img', config: { supports_reference: false } })
    ).toBe(false);
    expect(modelSupportsReference({ model_id: '@cf/runwayml/stable-diffusion-v1-5-img2img', config: null })).toBe(true);
    expect(modelSupportsReference({ model_id: '@cf/black-forest-labs/flux-2-klein-4b', config: { supports_reference: true } })).toBe(true);
    expect(modelSupportsReference({ model_id: '@cf/black-forest-labs/flux-2-klein-4b', config: null })).toBe(false);
    expect(modelSupportsReference({ model_id: 'flux', config: null })).toBe(false);
  });
  it('modelRendersText: flag text_capable atau famili Leonardo', () => {
    expect(modelRendersText({ model_id: '@cf/leonardo/phoenix-1.0', config: null })).toBe(true);
    expect(modelRendersText({ model_id: '@cf/leonardo/lucid-origin', config: null })).toBe(true);
    expect(modelRendersText({ model_id: 'x', config: { text_capable: true } })).toBe(true);
    expect(modelRendersText({ model_id: '@cf/black-forest-labs/flux-2-dev', config: null })).toBe(false);
  });
  it('stripNoTextClause: hanya buang klausa no/without text', () => {
    expect(stripNoTextClause('photorealistic, no text, no watermark')).toBe('photorealistic, no watermark');
    expect(stripNoTextClause('cinematic still, without text, dramatic lighting')).toBe('cinematic still, dramatic lighting');
    expect(stripNoTextClause('flat vector, no texture loss')).toBe('flat vector, no texture loss');
    expect(stripNoTextClause('')).toBe('');
  });
  it('clamp helper advanced: guidance/steps/dimensi', () => {
    expect(clampGuidance(99, 7.5)).toBe(10);
    expect(clampGuidance(-1, 7.5)).toBe(0);
    expect(clampGuidance('x', 4.5)).toBe(4.5);
    expect(clampTextSteps(99, 20, 1, 40)).toBe(40);
    expect(clampTextSteps(0, 20, 1, 40)).toBe(1);
    expect(clampTextSteps(2.6, 20, 1, 40)).toBe(3);
    expect(clampTextSteps('x', 20, 1, 40)).toBe(20);
    expect(clampRequestDimension(9999, 1024, 2500)).toBe(2500);
    expect(clampRequestDimension(100, 1024, 2048)).toBe(256);
    expect(clampRequestDimension('x', 1120, 2500)).toBe(1120);
  });
  it('clampAutoParams: Auto hemat ≤1024px / ≤25 steps', () => {
    expect(clampAutoParams({ width: 2048, height: 2048, steps: 40 })).toEqual({ width: 1024, height: 1024, steps: 25, clamped: true });
    expect(clampAutoParams({ width: 768, height: 768, steps: 10 })).toEqual({ width: 768, height: 768, steps: 10, clamped: false });
    expect(clampAutoParams({ width: null, height: null, steps: null })).toEqual({ width: null, height: null, steps: null, clamped: false });
  });
  it('modelDefaultParams: default per famili + override config', () => {
    expect(modelDefaultParams('@cf/leonardo/phoenix-1.0', null)).toMatchObject({ guidance: 2, maxSteps: 50, maxDim: 2048 });
    expect(modelDefaultParams('@cf/leonardo/lucid-origin', null)).toMatchObject({ guidance: 4.5, maxSteps: 40, maxDim: 2500 });
    expect(modelDefaultParams('@cf/black-forest-labs/flux-2-klein-4b', null)).toMatchObject({ steps: 4, maxSteps: 8 });
    expect(modelDefaultParams('@cf/leonardo/phoenix-1.0', { steps_default: 10, max_steps: 30 })).toMatchObject({ steps: 10, maxSteps: 30 });
  });
  it('modelNegativeMode: Phoenix/SD native, Lucid/Flux fold, config menang', () => {
    expect(modelNegativeMode('@cf/leonardo/phoenix-1.0', null)).toBe('native');
    expect(modelNegativeMode('@cf/leonardo/lucid-origin', null)).toBe('fold');
    expect(modelNegativeMode('@cf/black-forest-labs/flux-2-dev', null)).toBe('fold');
    expect(modelNegativeMode('@cf/runwayml/stable-diffusion-v1-5-img2img', null)).toBe('native');
    expect(modelNegativeMode('@cf/leonardo/lucid-origin', { negative_mode: 'native' })).toBe('native');
  });
  it('resolveEffectiveAdvanced: Auto clamp hemat, pin sampai maks model', () => {
    const row = { guidance: 9, steps: 40, seed: 7, req_width: 2048, req_height: 2048 };
    const auto = resolveEffectiveAdvanced({ model_id: '@cf/leonardo/lucid-origin', config: null }, row, false);
    expect(auto).toMatchObject({ guidance: 9, numSteps: 25, seed: 7, width: 1024, height: 1024, clamped: true });
    const pinned = resolveEffectiveAdvanced({ model_id: '@cf/leonardo/lucid-origin', config: null }, row, true);
    expect(pinned).toMatchObject({ guidance: 9, numSteps: 40, seed: 7, width: 2048, height: 2048, clamped: false });
    const empty = resolveEffectiveAdvanced({ model_id: '@cf/leonardo/phoenix-1.0', config: null }, {}, false);
    expect(empty.audit).toMatchObject({ guidance: 2, steps: 20, seed: null });
    expect(empty.guidance).toBeUndefined();
    expect(empty.clamped).toBe(false);
  });
  it('clamp + strip prefix data URL', () => {
    expect(clampImg2ImgStrength(2)).toBe(1);
    expect(clampImg2ImgStrength(-1)).toBe(0);
    expect(clampImg2ImgStrength('x')).toBe(DEFAULT_IMG2IMG_STRENGTH);
    expect(clampImg2ImgSteps(0)).toBe(1);
    expect(clampImg2ImgSteps(50)).toBe(20);
    expect(clampImg2ImgDimension(100, 1024)).toBe(256);
    expect(stripDataUrlPrefix(`data:image/png;base64,${B64}`)).toBe(B64);
    expect(stripDataUrlPrefix(`  ${B64}  `)).toBe(B64);
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
  it('appends Avoid: clause when negative provided', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }] })
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GeminiImageAdapter({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.1-flash-lite-image' }, 'gk');
    await adapter.generateImage({ prompt: 'pan', negativePrompt: 'watercolor, text' });
    const calls = fetchMock.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as { contents: { parts: { text: string }[] }[] };
    expect(body.contents[0]!.parts[0]!.text).toBe('pan Avoid: watercolor, text');
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

describe('mergeImageNegativePrompts', () => {
  it('joins user + style with comma', () => {
    expect(mergeImageNegativePrompts('blurry, text', 'watercolor, oil')).toBe('blurry, text, watercolor, oil');
  });
  it('returns user only when style empty', () => {
    expect(mergeImageNegativePrompts('blurry', '   ')).toBe('blurry');
  });
  it('returns style only when user empty', () => {
    expect(mergeImageNegativePrompts(null, 'watercolor')).toBe('watercolor');
  });
  it('returns undefined when both empty', () => {
    expect(mergeImageNegativePrompts(undefined, undefined)).toBeUndefined();
    expect(mergeImageNegativePrompts('  ', '  ')).toBeUndefined();
  });
});

describe('image_prompt builder/parser', () => {
  it('builds bilingual prompt + parses JSON with fence', () => {
    const { system, user } = buildImagePromptMessages({ mainId: 'panci lengket', mainEn: 'sticky pan' });
    expect(system).toContain('JSON ONLY');
    expect(system).toContain('visual_strategy');
    expect(system).toContain('DETAIL COMPLETENESS');
    expect(system).not.toContain('BEFORE');
    expect(user).toContain('sticky pan');
    const parsed = parseImagePrompt('```json\n{"visual_strategy": "after", "hook_keywords": ["lengket"], "contradiction_check": "shows sticky", "justification": "direct illustration", "image_prompt": "sticky frying pan close-up", "negative_prompt": "no text"}\n```');
    expect(parsed.image_prompt).toBe('sticky frying pan close-up');
    expect(parsed.negative_prompt).toBe('no text');
    expect(parsed.reasoning.visual_strategy).toBe('after');
  });
  it('rejects missing image_prompt', () => {
    expect(() => parseImagePrompt('{"foo": 1}')).toThrow(/image_prompt/);
    expect(() => parseImagePrompt('no json here')).toThrow();
  });
  it('defaults missing strategy to after', () => {
    const parsed = parseImagePrompt('{"image_prompt": "sunset field"}');
    expect(parsed.reasoning.visual_strategy).toBe('after');
  });
  it('normalizes legacy before strategy to after', () => {
    const parsed = parseImagePrompt('{"visual_strategy": "before", "image_prompt": "messy dorm corner"}');
    expect(parsed.reasoning.visual_strategy).toBe('after');
  });
});

describe('image_prompt gate (tanpa before)', () => {
  it('rejects too-short prompt', () => {
    const gate = validateImagePromptContradiction(
      {
        image_prompt: 'cat',
        reasoning: { visual_strategy: 'after', hook_keywords: [], contradiction_check: '', justification: '' }
      },
      'source'
    );
    expect(gate.ok).toBe(false);
    expect(gate.reasons.join(' ')).toMatch(/10 karakter/);
  });
  it('rejects unknown strategy', () => {
    const gate = validateImagePromptContradiction(
      {
        image_prompt: 'A cozy minimalist dorm corner with warm light',
        reasoning: { visual_strategy: 'surreal', hook_keywords: [], contradiction_check: '', justification: '' } as unknown as {
          visual_strategy: 'after'; hook_keywords: string[]; contradiction_check: string; justification: string;
        }
      },
      'source'
    );
    expect(gate.ok).toBe(false);
    expect(gate.reasons.join(' ')).toMatch(/tidak dikenal/);
  });
  it('accepts valid after visual', () => {
    const gate = validateImagePromptContradiction(
      {
        image_prompt: 'A cozy minimalist dorm corner with warm light and tidy desk',
        negative_prompt: 'text, watermark, logo',
        reasoning: { visual_strategy: 'after', hook_keywords: ['dorm'], contradiction_check: 'shows tidy desk', justification: 'direct illustration' }
      },
      'source'
    );
    expect(gate.ok).toBe(true);
  });
  it('accepts user-edited custom prompt', () => {
    const gate = validateImagePromptContradiction(
      {
        image_prompt: 'Medium shot of a young woman outside a simple house in Bandung, hazy volcanic ash',
        negative_prompt: 'text, watermark, logo',
        reasoning: { visual_strategy: 'custom', hook_keywords: [], contradiction_check: '', justification: 'user_edited' } as unknown as {
          visual_strategy: 'after'; hook_keywords: string[]; contradiction_check: string; justification: string;
        }
      },
      'source'
    );
    expect(gate.ok).toBe(true);
  });
});
