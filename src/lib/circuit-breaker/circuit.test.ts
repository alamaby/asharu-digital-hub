import { describe, expect, it, vi, beforeEach } from 'vitest';

const { clientRef, countersRef } = vi.hoisted(() => ({
  clientRef: { current: null as unknown },
  countersRef: { resetCalledWith: [] as [string, string][] }
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => clientRef.current
}));

vi.mock('@/lib/supabase/counters', () => ({
  resetFailureCounter: async (table: string, id: string) => {
    countersRef.resetCalledWith.push([table, id]);
  }
}));

import {
  resolveCircuitState,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS
} from './types';
import {
  attemptHalfOpenProbeReactivation,
  recordCircuitSuccess
} from './manager';

describe('resolveCircuitState FSM', () => {
  const now = new Date('2026-11-18T10:00:00Z').getTime();

  it('mengembalikan CLOSED jika failure_count di bawah ambang batas', () => {
    const state = resolveCircuitState({
      is_active: true,
      failure_count: 0,
      last_used_at: new Date(now - 1000).toISOString()
    }, now);
    expect(state).toBe('CLOSED');

    const state4 = resolveCircuitState({
      is_active: true,
      failure_count: CIRCUIT_FAILURE_THRESHOLD - 1,
      last_used_at: new Date(now - 1000).toISOString()
    }, now);
    expect(state4).toBe('CLOSED');
  });

  it('mengembalikan OPEN jika failure_count >= ambang batas dan masih dalam masa cooldown (< 15 menit)', () => {
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const state = resolveCircuitState({
      is_active: false,
      failure_count: CIRCUIT_FAILURE_THRESHOLD,
      last_used_at: fiveMinutesAgo
    }, now);
    expect(state).toBe('OPEN');
  });

  it('mengembalikan HALF_OPEN jika failure_count >= ambang batas dan masa cooldown (>= 15 menit) telah lewat', () => {
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();
    const state = resolveCircuitState({
      is_active: false,
      failure_count: CIRCUIT_FAILURE_THRESHOLD,
      last_used_at: twentyMinutesAgo
    }, now);
    expect(state).toBe('HALF_OPEN');
  });

  it('mengembalikan HALF_OPEN jika failure_count >= ambang batas tetapi last_used_at null', () => {
    const state = resolveCircuitState({
      is_active: false,
      failure_count: 5,
      last_used_at: null
    }, now);
    expect(state).toBe('HALF_OPEN');
  });
});

describe('attemptHalfOpenProbeReactivation', () => {
  type Row = Record<string, unknown>;

  function makeMockClient(tables: Record<string, Row[]>) {
    return {
      from: (table: string) => {
        let rows = [...(tables[table] ?? [])];
        const builder: Record<string, unknown> = {};
        Object.assign(builder, {
          select: () => builder,
          update: (patch: Row) => {
            return {
              in: (col: string, vals: unknown[]) => {
                tables[table] = (tables[table] ?? []).map((r) =>
                  vals.includes(r[col]) ? { ...r, ...patch } : r
                );
                return {
                  then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
                };
              }
            };
          },
          eq: (col: string, val: unknown) => {
            rows = rows.filter((r) => r[col] === val);
            return builder;
          },
          gte: (col: string, val: unknown) => {
            rows = rows.filter((r) => (r[col] as number) >= (val as number));
            return builder;
          },
          then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
        });
        return builder as never;
      }
    };
  }

  it('mengaktifkan kembali kunci yang sirkuitnya OPEN dan telah melewati cooldown', async () => {
    const now = Date.now();
    const oldTimestamp = new Date(now - CIRCUIT_COOLDOWN_MS - 60000).toISOString();
    const recentTimestamp = new Date(now - 60000).toISOString();

    const tables = {
      llm_provider_keys: [
        { id: 'k1', provider_id: 'p1', is_active: false, failure_count: 5, last_used_at: oldTimestamp },
        { id: 'k2', provider_id: 'p1', is_active: false, failure_count: 5, last_used_at: recentTimestamp },
        { id: 'k3', provider_id: 'p1', is_active: false, failure_count: 0, last_used_at: oldTimestamp }
      ]
    };

    clientRef.current = makeMockClient(tables);

    const activated = await attemptHalfOpenProbeReactivation('llm_provider_keys', 'p1');
    expect(activated).toEqual(['k1']);
    expect(tables.llm_provider_keys.find((r) => r.id === 'k1')!.is_active).toBe(true);
    expect(tables.llm_provider_keys.find((r) => r.id === 'k2')!.is_active).toBe(false);
  });
});

describe('recordCircuitSuccess', () => {
  beforeEach(() => {
    countersRef.resetCalledWith = [];
  });

  it('mereset failure counter saat key sebelumnya mengalami kegagalan', async () => {
    await recordCircuitSuccess('llm_provider_keys', 'key-1', 3);
    expect(countersRef.resetCalledWith).toEqual([['llm_provider_keys', 'key-1']]);
  });

  it('tidak memanggil resetFailureCounter jika currentFailureCount adalah 0', async () => {
    await recordCircuitSuccess('llm_provider_keys', 'key-2', 0);
    expect(countersRef.resetCalledWith).toEqual([]);
  });
});
