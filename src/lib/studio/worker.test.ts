import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { clientRef, adaptersRef } = vi.hoisted(() => ({
  clientRef: { current: null as unknown },
  adaptersRef: { current: null as unknown }
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => clientRef.current
}));

vi.mock('@/lib/image/key-pool', () => ({
  ImageKeyPool: class {
    constructor(private provider: { slug: string }) {}
    async withFallback<T>(fn: (apiKey: string, keyRow: { key_suffix: string }) => Promise<T>) {
      const calls = (adaptersRef.current as { calls: string[] } | null)?.calls;
      calls?.push(this.provider.slug);
      return { result: await fn('test-key', { key_suffix: 'test' }), keyRow: { key_suffix: 'test' } };
    }
  }
}));

vi.mock('@/lib/image/providers', () => ({
  createImageAdapter: (provider: { slug: string }) => ({
    generateImage: async () => {
      if (provider.slug === 'cloudflare') {
        const { ImageHttpError } = await import('@/lib/image/types');
        throw new ImageHttpError(400, 'cloudflare image 400: {"success":false}');
      }
      return { status: 'completed', imageBytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' };
    }
  })
}));

vi.mock('@/lib/image/storage', () => ({
  fetchRemoteImage: vi.fn(async () => ({ bytes: new Uint8Array([1]), mimeType: 'image/jpeg' }))
}));

vi.mock('@/lib/studio/storage', () => ({
  uploadUserImage: vi.fn(async () => ({ storagePath: 'u/img.png', publicUrl: 'https://cdn.test/img.png' })),
  removeUserImage: vi.fn(async () => {}),
  fetchReferenceBytes: vi.fn(async () => ({ bytes: new Uint8Array([9, 9]), mimeType: 'image/jpeg' }))
}));

vi.mock('@/lib/image/config', () => ({
  markImageModelUsage: vi.fn(async () => {}),
  markImageModelFailure: vi.fn(async () => {})
}));

import { processOneStudioImage } from './worker';

const provPixazo: Row = {
  id: 'prov-pixazo',
  slug: 'pixazo',
  display_name: 'Pixazo',
  base_url: 'https://gateway.pixazo.ai',
  is_active: true,
  priority: 10,
  config: {}
};
const provCf: Row = {
  id: 'prov-cf',
  slug: 'cloudflare',
  display_name: 'Cloudflare',
  base_url: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai',
  is_active: true,
  priority: 20,
  config: { account_id: 'abc123' }
};
const modelPixazo: Row = {
  id: 'model-pixazo-uuid',
  provider_id: 'prov-pixazo',
  model_id: 'flux-1-schnell',
  display_name: 'Flux 1 Schnell',
  is_default: true,
  is_active: true,
  priority: 10,
  config: null,
  usage_count: 0,
  failure_count: 0,
  last_used_at: null,
  image_providers: provPixazo
};
const modelCf: Row = {
  id: 'model-cf-uuid',
  provider_id: 'prov-cf',
  model_id: '@cf/black-forest-labs/flux-1-schnell',
  display_name: 'Flux 1 Schnell',
  is_default: true,
  is_active: true,
  priority: 20,
  config: null,
  usage_count: 0,
  failure_count: 0,
  last_used_at: null,
  image_providers: provCf
};

/** Client mock generik: rantai from/select/eq/order/limit + update/select terminal. */
function makeClient(tables: Record<string, Row[]>, updates: Row[]) {
  return {
    from(table: string) {
      let rows: Row[] = [...(tables[table] ?? [])];
      const builder = {
        select: () => builder,
        insert: () => builder,
        update: (patch: Row) => {
          updates.push({ table, patch });
          return builder;
        },
        delete: () => builder,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        lt: () => builder,
        order: () => builder,
        limit: () => builder,
        single: async () => ({ data: rows[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (onfulfilled: (v: { data: Row[]; error: null }) => unknown) =>
          onfulfilled({ data: rows, error: null })
      };
      return builder;
    }
  };
}

function studioRow(over: Row = {}): Row {
  return {
    id: 'img-1',
    user_id: 'u1',
    image_prompt: 'a cute cartoon cat sitting on a wooden chair, pastel colors',
    negative_prompt: null,
    provider_id: null,
    model_id: null,
    style_slug: null,
    subject_slug: null,
    camera_slug: null,
    aspect_slug: '1:1',
    provider_slug: '',
    model_slug: '',
    storage_path: null,
    public_url: null,
    width: null,
    height: null,
    status: 'pending',
    last_error: null,
    attempts: 0,
    llm_meta: null,
    expires_at: '2026-10-11T00:00:00Z',
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    reference_storage_path: null,
    reference_public_url: null,
    reference_strength: null,
    ...over
  };
}

function useSetup(rowOver: Row = {}) {
  const updates: Row[] = [];
  adaptersRef.current = { calls: [] };
  clientRef.current = makeClient(
    {
      image_studio_config: [{ id: 1, default_model_id: null, default_aspect_slug: '1:1', allow_empty_prompt: false }],
      user_image_generations: [studioRow(rowOver)],
      image_providers: [provPixazo, provCf],
      image_models: [modelPixazo, modelCf],
      image_style_presets: []
    },
    updates
  );
  return { updates };
}

function calls(): string[] {
  return (adaptersRef.current as { calls: string[] }).calls;
}

function finalStatus(updates: Row[]): Row | undefined {
  return [...updates].reverse().find((u) => (u.patch as Row).status === 'ready' || (u.patch as Row).status === 'failed');
}

describe('processOneStudioImage — strict-fail pin user', () => {
  it('pin cloudflare gagal → failed jujur, pixazo TIDAK dipanggil', async () => {
    const { updates } = useSetup({ provider_id: 'prov-cf', model_id: 'model-cf-uuid' });
    const res = await processOneStudioImage();
    expect(res.imageId).toBeNull();
    expect(res.error).toContain('cloudflare image 400');
    expect(calls()).toEqual(['cloudflare']);
    const fin = finalStatus(updates)?.patch as Row;
    expect(fin.status).toBe('failed');
    expect(String(fin.last_error)).toContain('cloudflare image 400');
  });

  it('Auto (null) gagal di pixazo-first? waterfall tetap jalan ke cloudflare', async () => {
    // Pixazo sukses di sini (mock hanya menggagalkan cloudflare) → Auto = pixazo.
    const { updates } = useSetup({});
    const res = await processOneStudioImage();
    expect(res.imageId).toBe('img-1');
    expect(calls()).toEqual(['pixazo']);
    const fin = finalStatus(updates)?.patch as Row;
    expect(fin.status).toBe('ready');
    expect(fin.provider_slug).toBe('pixazo');
    expect((fin.llm_meta as Row).pinned).toBe(false);
  });

  it('pin model nonaktif → failed jujur tanpa memanggil provider mana pun', async () => {
    const { updates } = useSetup({ provider_id: 'prov-cf', model_id: 'model-tidak-ada' });
    const res = await processOneStudioImage();
    expect(res.imageId).toBeNull();
    expect(res.error).toContain('Model pilihan tidak aktif');
    expect(calls()).toEqual([]);
    const fin = finalStatus(updates)?.patch as Row;
    expect(fin.status).toBe('failed');
  });

  it('pin provider nonaktif → failed jujur tanpa memanggil provider mana pun', async () => {
    useSetup({ provider_id: 'prov-tidak-ada' });
    const res = await processOneStudioImage();
    expect(res.imageId).toBeNull();
    expect(res.error).toContain('Provider pilihan tidak aktif');
    expect(calls()).toEqual([]);
  });

  it('referensi + model non-support terpin → failed jujur tanpa memanggil provider', async () => {
    const { updates } = useSetup({
      provider_id: 'prov-pixazo',
      model_id: 'model-pixazo-uuid',
      reference_public_url: 'https://cdn.test/ref.jpg',
      reference_strength: 0.4
    });
    const res = await processOneStudioImage();
    expect(res.imageId).toBeNull();
    expect(res.error).toContain('tidak mendukung image reference');
    expect(calls()).toEqual([]);
    const fin = finalStatus(updates)?.patch as Row;
    expect(fin.status).toBe('failed');
  });
});
