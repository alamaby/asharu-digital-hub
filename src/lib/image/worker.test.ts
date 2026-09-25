import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Filter = { op: 'eq' | 'neq' | 'lt' | 'gte' | 'in'; col: string; val: unknown };

const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as unknown as { images: Row[]; drafts: Row[]; providers: Row[]; models: Row[] } }
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => makeClient(dbRef.current)
}));

vi.mock('@/lib/llm/completion', () => ({
  runLLMCompletion: vi.fn(async () => ({ output: { text: '{}' }, providerSlug: 'p', model: 'm' }))
}));

vi.mock('@/lib/llm/stage-defaults', () => ({
  resolveStageModel: vi.fn(async () => ({ providerId: null, modelUuid: null }))
}));

vi.mock('@/lib/image/key-pool', () => ({
  ImageKeyPool: class {
    async withFallback<T>(fn: (apiKey: string, keyRow: { key_suffix: string }) => Promise<T>) {
      return { result: await fn('test-key', { key_suffix: 'test' }), keyRow: { key_suffix: 'test' } };
    }
  }
}));

vi.mock('@/lib/image/providers', () => ({
  createImageAdapter: () => ({
    generateImage: async () => ({ status: 'completed', imageBytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' })
  })
}));

vi.mock('@/lib/image/config', () => ({
  markImageModelFailure: vi.fn(async () => {}),
  markImageModelUsage: vi.fn(async () => {}),
  resolveImageTarget: vi.fn(async () => ({
    provider: { id: 'p1', slug: 'pixazo' },
    model: { id: 'm1', model_id: 'flux-1-schnell' },
    style: null,
    aspect: '1:1' as const,
    pinned: false
  }))
}));

vi.mock('@/lib/image/prompt', () => ({
  buildImagePromptMessages: () => ({ system: 's', user: 'u' }),
  parseImagePrompt: () => ({
    image_prompt: 'a photo of a room',
    negative_prompt: '',
    reasoning: { visual_strategy: 'after' }
  }),
  validateImagePromptContradiction: () => ({ ok: true, reasons: [] as string[] }),
  mergeImageNegativePrompts: () => ''
}));

vi.mock('@/lib/image/storage', () => ({
  fetchRemoteImage: vi.fn(async () => ({ bytes: new Uint8Array([1]), mimeType: 'image/jpeg' })),
  uploadDraftImage: vi.fn(async () => ({ storagePath: 'd/img.png', publicUrl: 'https://cdn.test/img.png' }))
}));

import { claimPendingImage, processImageTick, reapStuckImages } from './worker';

function matches(r: Row, filters: Filter[]): boolean {
  return filters.every(({ op, col, val }) => {
    const v = r[col];
    if (op === 'eq') return v === val;
    if (op === 'neq') return v !== val;
    if (op === 'lt') return (v as number) < (val as number);
    if (op === 'gte') return (v as number) >= (val as number);
    if (op === 'in') return (val as unknown[]).includes(v);
    return true;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(db: { images: Row[]; drafts: Row[]; providers: Row[]; models: Row[] }): any {
  const tableRows = (t: string): Row[] =>
    t === 'content_draft_images' ? db.images
    : t === 'content_drafts' ? db.drafts
    : t === 'image_providers' ? db.providers
    : t === 'image_models' ? db.models
    : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string): any => {
    const rows = tableRows(table);
    const filters: Filter[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let limitN: number | null = null;
    let countHead = false;
    let patch: Row | null = null;
    let inserted: Row[] = [];
    let selectedAfterPatch = false;
    const applyView = (): Row[] => {
      let out = inserted.length > 0 ? inserted : rows.filter((r) => matches(r, filters));
      for (const o of orders) {
        out = [...out].sort((a, b) => {
          const av = a[o.col] as string | number;
          const bv = b[o.col] as string | number;
          if (av === bv) return 0;
          return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count === 'exact' && opts?.head) countHead = true;
        if (patch) selectedAfterPatch = true;
        return api;
      },
      eq: (c: string, v: unknown) => { filters.push({ op: 'eq', col: c, val: v }); return api; },
      neq: (c: string, v: unknown) => { filters.push({ op: 'neq', col: c, val: v }); return api; },
      lt: (c: string, v: unknown) => { filters.push({ op: 'lt', col: c, val: v }); return api; },
      gte: (c: string, v: unknown) => { filters.push({ op: 'gte', col: c, val: v }); return api; },
      in: (c: string, v: unknown) => { filters.push({ op: 'in', col: c, val: v }); return api; },
      order: (c: string, o?: { ascending?: boolean }) => { orders.push({ col: c, asc: o?.ascending !== false }); return api; },
      limit: (n: number) => { limitN = n; return api; },
      insert: (obj: Row) => {
        const created = { id: `new-${Math.random().toString(36).slice(2)}`, ...obj };
        rows.push(created);
        inserted = [created];
        return api;
      },
      update: (p: Row) => { patch = p; return api; },
      async maybeSingle() {
        if (countHead) return { data: null, error: null, count: rows.filter((r) => matches(r, filters)).length };
        if (patch) {
          const targets = rows.filter((r) => matches(r, filters));
          for (const t of targets) Object.assign(t, patch);
          return { data: targets[0] ?? null, error: null };
        }
        const view = applyView();
        return { data: view[0] ?? null, error: null };
      },
      async single() {
        if (inserted.length > 0) return { data: inserted[0], error: null };
        const r = await api.maybeSingle();
        if (!r.data) return { data: null, error: { message: 'none' } };
        return r;
      },
      then(res: (v: unknown) => void) {
        // `await builder` langsung: update tanpa select (failImage, demote,
        // set selected, content_drafts) maupun count head enqueue.
        if (patch) {
          const targets = rows.filter((r) => matches(r, filters));
          for (const t of targets) Object.assign(t, patch);
          // update().select() → kembalikan baris yang berubah (reaper butuh
          // jumlah baris ter-update).
          res({ data: selectedAfterPatch ? targets : null, error: null });
        } else if (countHead) res({ data: null, error: null, count: rows.filter((r) => matches(r, filters)).length });
        else res({ data: applyView(), error: null });
      }
    };
    return api;
  };
  return { from };
}

function image(over: Partial<Row> & { id: string }): Row {
  return {
    draft_id: 'd1',
    post_index: 0,
    image_prompt: '',
    negative_prompt: null,
    reasoning: null,
    style_slug: null,
    camera_slug: null,
    provider_slug: '',
    model_id: '',
    key_suffix: null,
    storage_path: null,
    public_url: null,
    width: null,
    height: null,
    status: 'pending',
    last_error: null,
    attempts: 0,
    llm_meta: null,
    reference_storage_path: null,
    reference_public_url: null,
    reference_strength: null,
    created_at: '2026-09-14T07:00:00Z',
    updated_at: '2026-09-14T07:00:00Z',
    ...over
  };
}

function seedDb(images: Row[]) {
  dbRef.current = {
    images,
    drafts: [{
      id: 'd1',
      generated_thread: { main: { id: 'topik utama', en: 'main topic' }, replies: [] },
      research_topic_id: null,
      status: 'needs_review',
      created_at: '2026-09-14T06:00:00Z'
    }],
    providers: [{ id: 'p1', slug: 'pixazo', is_active: true, priority: 10 }],
    models: [{ id: 'm1', provider_id: 'p1', model_id: 'flux-1-schnell', is_default: true, is_active: true, priority: 10, config: null }]
  };
}

describe('claimPendingImage lanes', () => {
  it('jalur generate diklaim walau baris reasoning lebih tua', async () => {
    seedDb([
      image({ id: 'auto', image_prompt: '', created_at: '2026-09-14T07:00:00Z' }),
      image({ id: 'manual', image_prompt: 'a photo of a room', created_at: '2026-09-14T08:00:00Z' })
    ]);
    const gen = await claimPendingImage('generate');
    expect(gen?.id).toBe('manual');
    expect(gen?.attempts).toBe(1);
    const reason = await claimPendingImage('reasoning', gen?.id ?? null);
    expect(reason?.id).toBe('auto');
  });

  it('excludeId mencegah klaim ganda baris yang sama', async () => {
    seedDb([image({ id: 'only', image_prompt: 'a photo' })]);
    const first = await claimPendingImage('generate');
    expect(first?.id).toBe('only');
    // attempts naik → lt(3) masih lolos, tapi excludeId menolaknya.
    const second = await claimPendingImage('generate', first?.id ?? null);
    expect(second).toBeNull();
  });
});

describe('reapStuckImages', () => {
  it('pending kehabisan attempts & lama → failed + pesan jujur', async () => {
    seedDb([
      image({
        id: 'stuck',
        image_prompt: 'a photo of a room',
        attempts: 3,
        updated_at: '2026-09-14T07:00:00Z'
      })
    ]);
    const n = await reapStuckImages();
    expect(n).toBe(1);
    const row = dbRef.current.images.find((r) => r.id === 'stuck');
    expect(row?.status).toBe('failed');
    expect(String(row?.last_error)).toMatch(/attempts habis/);
  });

  it('pending attempts 3 tapi baru saja disentuh (masih diproses) → dibiarkan', async () => {
    seedDb([
      image({
        id: 'fresh',
        image_prompt: 'a photo of a room',
        attempts: 3,
        updated_at: new Date().toISOString()
      })
    ]);
    const n = await reapStuckImages();
    expect(n).toBe(0);
    expect(dbRef.current.images[0]?.status).toBe('pending');
  });

  it('pending attempts < max → tidak disentuh', async () => {
    seedDb([
      image({
        id: 'young',
        image_prompt: 'a photo of a room',
        attempts: 1,
        updated_at: '2026-09-14T07:00:00Z'
      })
    ]);
    const n = await reapStuckImages();
    expect(n).toBe(0);
    expect(dbRef.current.images[0]?.status).toBe('pending');
  });
});

describe('processImageTick', () => {
  it('memproses generate dulu lalu 1 reasoning dalam 1 tick', async () => {
    seedDb([
      image({ id: 'auto', image_prompt: '', created_at: '2026-09-14T07:00:00Z' }),
      image({ id: 'manual', image_prompt: 'a photo of a room', created_at: '2026-09-14T08:00:00Z' })
    ]);
    const res = await processImageTick();
    expect(res.processed).toBe(2);
    expect(res.imageId).toBe('manual');
    const byId = Object.fromEntries(dbRef.current.images.map((r) => [r.id, r]));
    expect(byId['manual']?.status).toBe('selected');
    expect(byId['manual']?.public_url).toBe('https://cdn.test/img.png');
    expect(byId['auto']?.status).toBe('prompt_ready');
  });

  it('reasoning-only bila tak ada generate pending', async () => {
    seedDb([image({ id: 'auto', image_prompt: '' })]);
    const res = await processImageTick();
    expect(res.processed).toBe(1);
    expect(res.imageId).toBe('auto');
    expect(dbRef.current.images[0]?.status).toBe('prompt_ready');
  });

  it('idle bila tak ada kerja dan tak ada draf tanpa cover', async () => {
    seedDb([]);
    dbRef.current.drafts = [];
    const res = await processImageTick();
    expect(res).toEqual({ imageId: null, processed: 0 });
  });
});
