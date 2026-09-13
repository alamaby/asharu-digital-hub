import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { clientRef, queryLog, storageRef } = vi.hoisted(() => ({
  clientRef: { current: null as unknown },
  storageRef: { current: new Set<string>() },
  queryLog: { current: [] as Array<{ table: string; calls: Array<{ op: string; col?: string; val?: unknown; ascending?: boolean }> }> }
}));

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'u1', email: 'u1@test.id' }))
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => clientRef.current
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

import { enqueueStudioImage, listUserImages } from './actions';
import { resolveFreshReferenceStoragePath } from './storage';
import { buildStudioEnhanceMessages } from '@/lib/image/prompt';

/** Client mock yang mencatat rantai query (eq/order/limit) per tabel. */
function makeClient(tables: Record<string, Row[]>) {
  return {
    storage: {
      from: () => ({
        exists: async (path: string) => ({ data: storageRef.current.has(path), error: null })
      })
    },
    from(table: string) {
      let rows: Row[] = [...(tables[table] ?? [])];
      const log = { table, calls: [] as Array<{ op: string; col?: string; val?: unknown; ascending?: boolean }> };
      queryLog.current.push(log);
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          log.calls.push({ op: 'eq', col, val });
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        gte: (col: string, val: unknown) => {
          log.calls.push({ op: 'gte', col, val });
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          log.calls.push({ op: 'order', col, ascending: opts?.ascending });
          const asc = opts?.ascending ?? true;
          rows = [...rows].sort((a, b) =>
            String(a[col] ?? '') < String(b[col] ?? '') ? (asc ? -1 : 1) : asc ? 1 : -1
          );
          return builder;
        },
        limit: () => builder,
        or: () => builder,
        insert: (patch: Row) => {
          log.calls.push({ op: 'insert', val: patch });
          return builder;
        },
        single: async () => ({ data: { id: 'new-img', expires_at: '2026-10-11T00:00:00Z' }, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (onfulfilled: (v: { data: Row[]; error: null }) => unknown) =>
          onfulfilled({ data: rows, error: null })
      };
      return builder;
    }
  };
}

function row(over: Row = {}): Row {
  return {
    id: 'img-1',
    user_id: 'u1',
    image_prompt: 'a cat',
    negative_prompt: null,
    provider_id: null,
    model_id: null,
    style_slug: null,
    subject_slug: null,
    camera_slug: null,
    aspect_slug: '1:1',
    provider_slug: 'pixazo',
    model_slug: 'flux-1-schnell',
    storage_path: null,
    public_url: null,
    width: null,
    height: null,
    status: 'ready',
    last_error: null,
    attempts: 1,
    llm_meta: null,
    expires_at: '2026-10-11T00:00:00Z',
    created_at: '2026-09-11T10:00:00Z',
    updated_at: '2026-09-11T11:00:00Z',
    ...over
  };
}

function useTables(rows: Row[]) {
  queryLog.current = [];
  clientRef.current = makeClient({ user_image_generations: rows });
}

function lastListCalls() {
  const found = [...queryLog.current].reverse().find((l) => l.table === 'user_image_generations');
  return found?.calls ?? [];
}

describe('listUserImages — filter + sort', () => {
  it('default: tanpa filter status, sort created_at desc', async () => {
    useTables([row({ id: 'a', created_at: '2026-09-10T00:00:00Z' }), row({ id: 'b', created_at: '2026-09-11T00:00:00Z' })]);
    const rows = await listUserImages();
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
    const calls = lastListCalls();
    expect(calls.some((c) => c.op === 'eq' && c.col === 'status')).toBe(false);
    expect(calls).toContainEqual({ op: 'order', col: 'created_at', ascending: false });
  });

  it('status + provider + model + slug diteruskan sebagai eq', async () => {
    useTables([
      row({ id: 'keep', status: 'failed', provider_id: 'prov-cf', model_id: 'm-cf', style_slug: 'anime', aspect_slug: '1:1' }),
      row({ id: 'drop', status: 'ready', provider_id: 'prov-1', model_id: 'm-1', style_slug: 'ugly', aspect_slug: '16:9' })
    ]);
    const rows = await listUserImages({
      status: 'failed',
      providerId: 'prov-cf',
      modelId: 'm-cf',
      styleSlug: 'anime',
      aspectSlug: '1:1'
    });
    expect(rows.map((r) => r.id)).toEqual(['keep']);
  });

  it('sort updated_at asc dihormati', async () => {
    useTables([
      row({ id: 'new', updated_at: '2026-09-12T00:00:00Z' }),
      row({ id: 'old', updated_at: '2026-09-10T00:00:00Z' })
    ]);
    const rows = await listUserImages({ sortBy: 'updated_at', dir: 'asc' });
    expect(rows.map((r) => r.id)).toEqual(['old', 'new']);
    expect(lastListCalls()).toContainEqual({ op: 'order', col: 'updated_at', ascending: true });
  });
});

describe('resolveFreshReferenceStoragePath — upload baru milik sendiri', () => {
  const base = 'https://xyz.supabase.co';
  const userId = 'd4406141-00e9-490c-992a-9415c3b32ee1';
  const good = `${base}/storage/v1/object/public/user-images/ref/${userId}/02a5e512-2181-4441-b6bc-1f3ed94c7d23.png`;

  it('URL ref milik sendiri → turunkan storage path', () => {
    expect(resolveFreshReferenceStoragePath({ userId, publicUrl: good, supabaseUrl: base })).toBe(
      `ref/${userId}/02a5e512-2181-4441-b6bc-1f3ed94c7d23.png`
    );
  });

  it('user lain / bucket lain / ekstensi liar / traversal → null', () => {
    const otherUser = `${base}/storage/v1/object/public/user-images/ref/aaaaaaaa-0000-4000-8000-000000000000/02a5e512-2181-4441-b6bc-1f3ed94c7d23.png`;
    const otherBucket = `${base}/storage/v1/object/public/draft-images/ref/${userId}/02a5e512-2181-4441-b6bc-1f3ed94c7d23.png`;
    const badExt = `${base}/storage/v1/object/public/user-images/ref/${userId}/evil.svg`;
    const traversal = `${base}/storage/v1/object/public/user-images/ref/${userId}/../u1/x.png`;
    const args = { userId, supabaseUrl: base };
    expect(resolveFreshReferenceStoragePath({ ...args, publicUrl: otherUser })).toBeNull();
    expect(resolveFreshReferenceStoragePath({ ...args, publicUrl: otherBucket })).toBeNull();
    expect(resolveFreshReferenceStoragePath({ ...args, publicUrl: badExt })).toBeNull();
    expect(resolveFreshReferenceStoragePath({ ...args, publicUrl: traversal })).toBeNull();
    expect(resolveFreshReferenceStoragePath({ userId, publicUrl: good, supabaseUrl: '' })).toBeNull();
  });
});

describe('enqueueStudioImage — referensi upload baru vs histori', () => {
  const base = 'https://xyz.supabase.co';
  const userId = 'u1';
  const OLD_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const freshUrl = `${base}/storage/v1/object/public/user-images/ref/${userId}/02a5e512-2181-4441-b6bc-1f3ed94c7d23.png`;
  const freshPath = `ref/${userId}/02a5e512-2181-4441-b6bc-1f3ed94c7d23.png`;

  function useEnqueueTables(tables: Record<string, Row[]>, existingStorage: string[] = []) {
    queryLog.current = [];
    storageRef.current = new Set(existingStorage);
    process.env.NEXT_PUBLIC_SUPABASE_URL = base;
    clientRef.current = makeClient(tables);
  }

  function enqueueInput(over: Row = {}) {
    return {
      prompt: 'a tidy bedroom with soft morning light',
      aspectSlug: '1:1',
      ...over
    };
  }

  function insertedPatch() {
    const found = [...queryLog.current]
      .reverse()
      .flatMap((l) => (l.table === 'user_image_generations' ? l.calls : []))
      .find((c) => c.op === 'insert');
    return (found?.val ?? {}) as Row;
  }

  it('upload baru milik sendiri + file ada → lolos dengan storage path turunan', async () => {
    useEnqueueTables(
      {
        user_image_generations: [],
        image_aspect_ratios: [{ slug: '1:1', is_active: true }]
      },
      [freshPath]
    );
    const res = await enqueueStudioImage(
      enqueueInput({ referencePublicUrl: freshUrl, referenceStrength: 0.6 })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.imageId).toBe('new-img');
    const patch = insertedPatch();
    expect(patch.reference_public_url).toBe(freshUrl);
    expect(patch.reference_storage_path).toBe(freshPath);
    expect(patch.reference_strength).toBe(0.6);
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_ENV;
  });

  it('URL asing (bukan ref milik sendiri) → ditolak dengan pesan asli', async () => {
    useEnqueueTables({
      user_image_generations: [],
      image_aspect_ratios: [{ slug: '1:1', is_active: true }]
    });
    const res = await enqueueStudioImage(enqueueInput({ referencePublicUrl: 'https://evil.test/x.jpg' }));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('harus gagal');
    expect(res.error).toContain('Referensi harus dari upload atau histori milik Anda.');
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_ENV;
  });

  it('URL ref milik sendiri tapi file tak ada → ditolak', async () => {
    useEnqueueTables({
      user_image_generations: [],
      image_aspect_ratios: [{ slug: '1:1', is_active: true }]
    });
    const res = await enqueueStudioImage(enqueueInput({ referencePublicUrl: freshUrl }));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('harus gagal');
    expect(res.error).toContain('Referensi harus dari upload atau histori milik Anda.');
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_ENV;
  });

  it('pakai ulang dari histori tetap lolos (jalur lama)', async () => {
    const reuseUrl = 'https://xyz.supabase.co/storage/v1/object/public/user-images/u1/old.png';
    useEnqueueTables({
      user_image_generations: [row({ id: 'old', user_id: 'u1', public_url: reuseUrl, storage_path: 'u1/old.png' })],
      image_aspect_ratios: [{ slug: '1:1', is_active: true }]
    });
    const res = await enqueueStudioImage(enqueueInput({ referencePublicUrl: reuseUrl }));
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.imageId).toBe('new-img');
    expect(insertedPatch().reference_storage_path).toBe('u1/old.png');
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_ENV;
  });

  it('exists() error transient → best-effort lanjut (tidak blokir enqueue)', async () => {
    useEnqueueTables({
      user_image_generations: [],
      image_aspect_ratios: [{ slug: '1:1', is_active: true }]
    });
    (clientRef.current as { storage: { from: () => { exists: () => Promise<never> } } }).storage = {
      from: () => ({ exists: () => Promise.reject(new Error('network down')) })
    };
    const res = await enqueueStudioImage(enqueueInput({ referencePublicUrl: freshUrl }));
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.imageId).toBe('new-img');
    expect(insertedPatch().reference_storage_path).toBe(freshPath);
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_ENV;
  });

  it('error validasi mengembalikan pesan asli sebagai data (bukan throw → masking prod)', async () => {
    useEnqueueTables({
      user_image_generations: [],
      image_aspect_ratios: [{ slug: '1:1', is_active: true }]
    });
    const res = await enqueueStudioImage(enqueueInput({ prompt: 'pendek' }));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('harus gagal');
    expect(res.error).toContain('Prompt minimal 10 karakter');
    process.env.NEXT_PUBLIC_SUPABASE_URL = OLD_ENV;
  });
});

describe('buildStudioEnhanceMessages — studio tanpa konteks post', () => {
  it('menyertakan draf + negative + style hint, tanpa Source post', () => {
    const { system, user } = buildStudioEnhanceMessages({
      promptDraft: 'kamar tidur rapi',
      negativeDraft: 'blurry',
      styleSuffix: 'photorealistic photo'
    });
    expect(system).toContain('POLISH mode');
    expect(system).toContain('NO source post');
    expect(user).toContain('kamar tidur rapi');
    expect(user).toContain('blurry');
    expect(user).toContain('photorealistic photo');
    expect(user).not.toContain('Source post');
  });

  it('tanpa negative/style tetap valid', () => {
    const { user } = buildStudioEnhanceMessages({ promptDraft: 'a cat on a chair, soft light' });
    expect(user).toContain('a cat on a chair');
    expect(user).not.toContain('User draft negative');
  });
});
