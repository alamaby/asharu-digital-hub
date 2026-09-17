import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const UUID_P1 = '11111111-1111-4111-8111-111111111111';
const UUID_M1 = '22222222-2222-4222-8222-222222222222';
const UUID_P2 = '33333333-3333-4333-8333-333333333333';
const UUID_M2 = '44444444-4444-4444-8444-444444444444';

const { clientRef, llmImpl, inserted } = vi.hoisted(() => ({
  clientRef: { current: null as unknown },
  inserted: { current: [] as Array<{ table: string; rows: unknown }> },
  llmImpl: {
    current: async () => ({
      output: {
        text: 'Halo dunia',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
        thoughtTokens: null
      },
      providerSlug: 'naraya',
      model: 'naraya/model-a',
      keyHash: 'abc123',
      latencyMs: 1000,
      fallback: false
    })
  }
}));

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'u1', email: 'u1@test.id' }))
}));

vi.mock('@/lib/auth/is-admin', () => ({
  isAdmin: vi.fn(async () => false)
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => clientRef.current
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({})
}));

vi.mock('@/lib/llm/completion', () => ({
  runLLMCompletion: (...args: unknown[]) => (llmImpl.current as (...a: unknown[]) => Promise<unknown>)(...args)
}));

vi.mock('@/lib/content/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, count: 0 })),
  incrementRateLimit: vi.fn(async () => {}),
  getClientIp: vi.fn(() => '1.2.3.4')
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers())
}));

import { deleteLabBatch, getLabBatch, getLabQuota, listLabBatches, runChatLabBatch } from './actions';
import { buildLabExpiry } from './validation';

const PROVIDERS = [
  { id: UUID_P1, slug: 'naraya', display_name: 'Naraya', is_active: true },
  { id: UUID_P2, slug: 'openrouter', display_name: 'OpenRouter', is_active: true }
];
const MODELS = [
  { id: UUID_M1, provider_id: UUID_P1, model_id: 'naraya/model-a', display_name: 'Model A', is_active: true },
  { id: UUID_M2, provider_id: UUID_P2, model_id: 'openrouter/model-b', display_name: 'Model B', is_active: true }
];
const CONFIG = {
  id: 1,
  retention_days: 30,
  daily_limit: 50,
  max_targets: 3,
  default_temperature: 0.7,
  default_max_tokens: 1000
};

/** Mock client minimal untuk chat_lab_* + llm_* (rantai supabase-js). */
function makeClient(db: { batches?: Row[]; runs?: Row[]; batchCount?: number }) {
  return {
    from(table: string) {
      let head = false;
      let rows: Row[] = [];
      if (table === 'llm_providers') rows = [...PROVIDERS];
      else if (table === 'llm_models') rows = [...MODELS];
      else if (table === 'chat_lab_config') rows = [{ ...CONFIG }];
      else if (table === 'chat_lab_batches') rows = [...(db.batches ?? [])];
      else if (table === 'chat_lab_runs') rows = [...(db.runs ?? [])];
      const builder = {
        select: (_c?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) head = true;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        gte: () => builder,
        lt: () => builder,
        order: () => builder,
        limit: () => builder,
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((r) => (vals as unknown[]).includes(r[col]));
          return builder;
        },
        insert: (patch: unknown) => {
          inserted.current.push({ table, rows: patch });
          return builder;
        },
        delete: () => builder,
        single: async () => {
          if (table === 'chat_lab_batches') return { data: { id: 'batch-1' }, error: null };
          return { data: rows[0] ?? null, error: null };
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (onfulfilled: (v: { data: Row[]; error: null; count?: number }) => unknown) => {
          if (head) return onfulfilled({ data: [], error: null, count: db.batchCount ?? 0 });
          return onfulfilled({ data: rows, error: null });
        }
      };
      return builder;
    }
  };
}

function resetDb(db: { batches?: Row[]; runs?: Row[]; batchCount?: number } = {}) {
  inserted.current = [];
  clientRef.current = makeClient(db);
  llmImpl.current = async () => ({
    output: {
      text: 'Halo dunia',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: 'stop',
      thoughtTokens: null
    },
    providerSlug: 'naraya',
    model: 'naraya/model-a',
    keyHash: 'abc123',
    latencyMs: 1000,
    fallback: false
  });
}

const TARGETS = [
  { providerId: UUID_P1, modelId: UUID_M1 },
  { providerId: UUID_P2, modelId: UUID_M2 }
];

describe('runChatLabBatch', () => {
  it('sukses 2 target: batch + 2 runs dengan tok/s derived', async () => {
    resetDb();
    const res = await runChatLabBatch({
      systemPrompt: null,
      userPrompt: 'Jelaskan fotosintesis dalam dua kalimat singkat.',
      temperature: null,
      maxTokens: null,
      targets: TARGETS
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.batchId).toBe('batch-1');
    const batchInsert = inserted.current.find((i) => i.table === 'chat_lab_batches');
    const runsInsert = inserted.current.find((i) => i.table === 'chat_lab_runs');
    expect(batchInsert).toBeDefined();
    expect((runsInsert?.rows as Row[])).toHaveLength(2);
    expect((runsInsert?.rows as Row[])[0]).toMatchObject({ tokens_per_sec: 20, http_status: 200 });
  });

  it('menolak target duplikat', async () => {
    resetDb();
    const res = await runChatLabBatch({
      systemPrompt: null,
      userPrompt: 'Prompt yang cukup panjang untuk lolos validasi.',
      temperature: null,
      maxTokens: null,
      targets: [
        { providerId: UUID_P1, modelId: UUID_M1 },
        { providerId: UUID_P1, modelId: UUID_M1 }
      ]
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/duplikat/);
  });

  it('menolak pin silang provider/model', async () => {
    resetDb();
    const res = await runChatLabBatch({
      systemPrompt: null,
      userPrompt: 'Prompt yang cukup panjang untuk lolos validasi.',
      temperature: null,
      maxTokens: null,
      targets: [{ providerId: UUID_P1, modelId: UUID_M2 }]
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/bukan milik provider/);
  });

  it('target gagal (strict) tercatat sebagai run error, batch tetap ok', async () => {
    resetDb();
    let calls = 0;
    llmImpl.current = async () => {
      calls += 1;
      if (calls === 1) throw new Error('Model pilihan gagal (strict, tanpa fallback ke waterfall global) — lihat log untuk detail.');
      return {
        output: {
          text: 'OK kedua',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          finishReason: 'stop',
          thoughtTokens: null
        },
        providerSlug: 'openrouter',
        model: 'openrouter/model-b',
        keyHash: 'def456',
        latencyMs: 500,
        fallback: false
      };
    };
    const res = await runChatLabBatch({
      systemPrompt: null,
      userPrompt: 'Prompt yang cukup panjang untuk lolos validasi.',
      temperature: null,
      maxTokens: null,
      targets: TARGETS
    });
    expect(res.ok).toBe(true);
    const runsInsert = inserted.current.find((i) => i.table === 'chat_lab_runs');
    const rows = (runsInsert?.rows as Row[]) ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ error: expect.stringMatching(/strict/), response_text: null });
    expect(rows[1]).toMatchObject({ response_text: 'OK kedua' });
  });

  it('kuota harian habis ditolak jujur', async () => {
    resetDb({ batchCount: 50 });
    const res = await runChatLabBatch({
      systemPrompt: null,
      userPrompt: 'Prompt yang cukup panjang untuk lolos validasi.',
      temperature: null,
      maxTokens: null,
      targets: [TARGETS[0]!]
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/Kuota harian habis/);
  });
});

describe('listLabBatches — filter status', () => {
  const B1 = { id: 'b1', user_id: 'u1', user_prompt: 'p1', created_at: '2026-09-17T10:00:00Z', expires_at: '2026-10-17T00:00:00Z' };
  const B2 = { id: 'b2', user_id: 'u1', user_prompt: 'p2', created_at: '2026-09-17T11:00:00Z', expires_at: '2026-10-17T00:00:00Z' };
  const okRun = { id: 'r1', batch_id: 'b1', user_id: 'u1', provider_slug: 'naraya', model_slug: 'naraya/model-a', error: null, response_text: 'ok', created_at: '2026-09-17T10:00:01Z' };
  const errRun = { id: 'r2', batch_id: 'b2', user_id: 'u1', provider_slug: '', model_slug: '', error: 'boom', response_text: null, created_at: '2026-09-17T11:00:01Z' };

  it('status=ok hanya batch tanpa error', async () => {
    resetDb({ batches: [B1, B2], runs: [okRun, errRun] });
    const out = await listLabBatches({ status: 'ok' });
    expect(out.map((b) => b.batch.id)).toEqual(['b1']);
  });

  it('status=error hanya batch dengan error', async () => {
    resetDb({ batches: [B1, B2], runs: [okRun, errRun] });
    const out = await listLabBatches({ status: 'error' });
    expect(out.map((b) => b.batch.id)).toEqual(['b2']);
  });
});

describe('getLabBatch', () => {
  it('milik sendiri kembali batch + runs', async () => {
    resetDb({
      batches: [{ id: 'b1', user_id: 'u1', user_prompt: 'halo dunia tes' }],
      runs: [{ id: 'r1', batch_id: 'b1', user_id: 'u1', provider_slug: 'naraya' }]
    });
    const out = await getLabBatch('b1');
    expect(out.batch.id).toBe('b1');
    expect(out.runs).toHaveLength(1);
  });

  it('batch hilang throw jujur', async () => {
    resetDb({ batches: [], runs: [] });
    await expect(getLabBatch('missing')).rejects.toThrow(/tidak ditemukan/);
  });
});

describe('getLabQuota + deleteLabBatch + buildLabExpiry', () => {
  it('kuota menghitung sisa harian', async () => {
    resetDb({ batchCount: 48 });
    const q = await getLabQuota();
    expect(q).toEqual({ used: 48, limit: 50, remaining: 2 });
  });

  it('delete batch milik sendiri ok', async () => {
    resetDb({ batches: [{ id: 'b1', user_id: 'u1' }] });
    const res = await deleteLabBatch('b1');
    expect(res.ok).toBe(true);
  });

  it('expiry = now + retention_days', () => {
    const exp = buildLabExpiry(new Date('2026-09-17T00:00:00Z'), 30);
    expect(exp.startsWith('2026-10-17')).toBe(true);
  });
});
