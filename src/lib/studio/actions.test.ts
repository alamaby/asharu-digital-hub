import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { clientRef, queryLog } = vi.hoisted(() => ({
  clientRef: { current: null as unknown },
  queryLog: { current: [] as Array<{ table: string; calls: Array<{ op: string; col?: string; val?: unknown; ascending?: boolean }> }> }
}));

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'u1', email: 'u1@test.id' }))
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => clientRef.current
}));

import { listUserImages } from './actions';
import { buildStudioEnhanceMessages } from '@/lib/image/prompt';

/** Client mock yang mencatat rantai query (eq/order/limit) per tabel. */
function makeClient(tables: Record<string, Row[]>) {
  return {
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
