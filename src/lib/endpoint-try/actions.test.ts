import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { clientRef, inserted } = vi.hoisted(() => ({
  clientRef: { current: null as unknown },
  inserted: { current: [] as Array<{ table: string; rows: unknown }> }
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

import {
  cleanupExpiredEndpointTryRuns,
  deleteEndpointTryRun,
  getEndpointTryQuota,
  listEndpointTryRuns,
  saveEndpointTryRun
} from './actions';

const CONFIG = {
  id: 1,
  retention_days: 30,
  daily_limit: 50 as number | null,
  max_targets: 3,
  default_temperature: 0.7,
  default_max_tokens: 1000
};

function applyFilter(rows: Row[], eqCol: string | null, eqVal: unknown): Row[] {
  if (eqCol === null) return rows;
  return rows.filter((r) => r[eqCol] === eqVal);
}

function sortRows(rows: Row[], orderCol: string | null, ascending: boolean): Row[] {
  if (!orderCol) return rows;
  return [...rows].sort((a, b) => {
    const av = a[orderCol];
    const bv = b[orderCol];
    if (av == null && bv == null) return 0;
    if (av == null) return ascending ? 1 : -1;
    if (bv == null) return ascending ? -1 : 1;
    if (av < bv) return ascending ? -1 : 1;
    if (av > bv) return ascending ? 1 : -1;
    return 0;
  });
}

function makeClient(runs: Row[], config: typeof CONFIG = CONFIG) {
  // Mutable store keyed by table name so queries on different tables share no state.
  const tables: Record<string, Row[]> = {
    endpoint_try_runs: [...runs],
    chat_lab_config: [{ ...CONFIG, ...config }]
  };

  function getTable(t: string): Row[] {
    return tables[t] ?? [];
  }

  return {
    from(table: string) {
      let wantCount = false;
      let headOnly = false;
      let orderCol: string | null = null;
      let orderAsc = false;
      let eqCol: string | null = null;
      let eqVal: unknown = undefined;
      let rangeFrom = 0;
      let rangeTo = 99999;

      const builder = {
        select(_c?: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.count === 'exact') wantCount = true;
          if (opts?.head) headOnly = true;
          return builder;
        },
        eq(col: string, val: unknown) {
          eqCol = col;
          eqVal = val;
          return builder;
        },
        gte() {
          return builder;
        },
        lt() {
          return builder;
        },
        order(col: string, o?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = o?.ascending ?? false;
          return builder;
        },
        range(from: number, to: number) {
          rangeFrom = from;
          rangeTo = to;
          return builder;
        },
        insert(patch: unknown) {
          inserted.current.push({ table, rows: patch });
          if (Array.isArray(patch)) {
            // Batch insert: mutate store in-place so single/select see new rows.
            const existing = getTable(table);
            const merged = [...existing, ...(patch as Row[])];
            tables[table] = merged;
          } else if (typeof patch === 'object' && patch !== null) {
            const existing = getTable(table);
            const p = { id: `gen_${Date.now()}`, ...patch } as Row;
            tables[table] = [...existing, p];
          }
          return builder;
        },
        delete() {
          // Mark rows to delete via a special flag, handled in then().
          return builder;
        },
        single: async () => {
          const rows = sortRows(applyFilter(getTable(table), eqCol, eqVal), orderCol, orderAsc);
          const sliced = rows.slice(rangeFrom, rangeTo + 1);
          return { data: sliced[0] ?? null, error: null };
        },
        maybeSingle: async () => {
          const rows = sortRows(applyFilter(getTable(table), eqCol, eqVal), orderCol, orderAsc);
          const sliced = rows.slice(rangeFrom, rangeTo + 1);
          return { data: sliced[0] ?? null, error: null };
        },
        then: async (
          onfulfilled: (v: {
            data: unknown[];
            error: null;
            count?: number;
          }) => Promise<unknown>
        ) => {
          const rows = sortRows(applyFilter(getTable(table), eqCol, eqVal), orderCol, orderAsc);
          const sliced = rows.slice(rangeFrom, rangeTo + 1);
          return onfulfilled({
            data: headOnly ? [] : sliced,
            error: null,
            count: wantCount ? getTable(table).length : undefined
          });
        }
      };
      return builder;
    }
  };
}

function resetDb(runs: Row[] = []) {
  inserted.current = [];
  clientRef.current = makeClient(runs);
}

function validPayload(patch: Partial<Row> = {}) {
  return {
    providerKind: 'openai' as const,
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-4o',
    systemPrompt: null,
    userPrompt: '1234567890',
    temperature: null,
    maxTokens: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    latencyMs: null,
    tokensPerSec: null,
    finishReason: null,
    error: null,
    requestMessages: [],
    responseText: 'OK',
    ...patch
  };
}

describe('saveEndpointTryRun', () => {
  it('input berisi apiKey ditolak sebelum insert', async () => {
    resetDb();
    const res = await saveEndpointTryRun(validPayload({ apiKey: 'secret123' }));
    expect(res.ok).toBe(false);
    expect(inserted.current.some((i) => i.table === 'endpoint_try_runs')).toBe(false);
  });

  it('input tanpa error & tanpa response_text ditolak', async () => {
    resetDb();
    const res = await saveEndpointTryRun(validPayload({ error: null, responseText: null }));
    expect(res.ok).toBe(false);
    expect(inserted.current.some((i) => i.table === 'endpoint_try_runs')).toBe(false);
  });

  it('input valid menyimpan row tanpa properti key', async () => {
    resetDb();
    const res = await saveEndpointTryRun(validPayload());
    expect(res.ok).toBe(true);
    const ins = inserted.current.find((i) => i.table === 'endpoint_try_runs');
    expect(ins).toBeDefined();
    const row = ins!.rows as Record<string, unknown>;
    expect(row.provider_kind).toBe('openai');
    expect(row.base_url).toBe('https://api.example.com/v1');
    expect(row.api_key).toBeUndefined();
    expect(row.key).toBeUndefined();
    expect(row.error).toBeNull();
    expect(row.response_text).toBe('OK');
  });

  it('kuota harian habis ditolak', async () => {
    // 51 baris milik u1 agar melewati daily_limit=50.
    resetDb(
      Array.from({ length: 51 }, (_, i) => ({ id: `r${i}`, user_id: 'u1' }))
    );
    const res = await saveEndpointTryRun(validPayload());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Kuota harian habis/);
  });
});

describe('listEndpointTryRuns', () => {
  it('hanya milik sendiri, pemilik lain dilanggar', async () => {
    resetDb([
      { id: 'own', user_id: 'u1' },
      { id: 'other', user_id: 'other' }
    ]);
    const out = await listEndpointTryRuns({ page: 1, pageSize: 10 });
    expect(out.items.map((r) => r.id)).toEqual(['own']);
  });

  it('owner lain gagal dihapus', async () => {
    resetDb([{ id: 'own', user_id: 'u1' }]);
    const res = await deleteEndpointTryRun('other-id');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/tidak ditemukan/);
  });
});

describe('deleteEndpointTryRun', () => {
  it('milik sendiri berhasil', async () => {
    resetDb([{ id: 'r1', user_id: 'u1' }]);
    const res = await deleteEndpointTryRun('r1');
    expect(res.ok).toBe(true);
  });

  it('id asing gagal jujur', async () => {
    resetDb([{ id: 'r1', user_id: 'u1' }]);
    const res = await deleteEndpointTryRun('missing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/tidak ditemukan/);
  });
});

describe('getEndpointTryQuota', () => {
  it('menghitung jumlah hari ini', async () => {
    const today = new Date().toISOString();
    resetDb([
      { id: 'r1', user_id: 'u1', created_at: today },
      { id: 'r2', user_id: 'u1', created_at: today }
    ]);
    const q = await getEndpointTryQuota();
    expect(q).toEqual({ used: 2, limit: 50, remaining: 48 });
  });

  it('daily_limit null = unlimited', async () => {
    resetDb();
    const old = clientRef.current;
    clientRef.current = makeClient([], { ...CONFIG, daily_limit: null });
    try {
      const q = await getEndpointTryQuota();
      expect(q.limit).toBeNull();
      expect(q.remaining).toBeNull();
    } finally {
      clientRef.current = old;
    }
  });
});

describe('cleanupExpiredEndpointTryRuns', () => {
  it('menghapus baris expired dan mengembalikan count', async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString();
    resetDb([
      { id: 'e1', user_id: 'u1', expires_at: past },
      { id: 'e2', user_id: 'u1', expires_at: past }
    ]);
    const out = await cleanupExpiredEndpointTryRuns();
    expect(out.deletedRuns).toBe(2);
  });
});
