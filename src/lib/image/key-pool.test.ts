import { describe, expect, it, vi } from 'vitest';

const { clientRef } = vi.hoisted(() => ({ clientRef: { current: null as unknown } }));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => clientRef.current
}));

import { fetchOrderedImageKeys } from './key-pool';

interface Attempt {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

/** Client mock: antrean hasil per percobaan query + pencatat jumlah panggilan. */
function makeClient(attempts: Attempt[], calls: string[]) {
  let n = 0;
  return {
    from(table: string) {
      const attempt = attempts[Math.min(n, attempts.length - 1)] as Attempt;
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (onfulfilled: (v: Attempt) => unknown) => {
          n += 1;
          calls.push(table);
          return onfulfilled(attempt);
        }
      };
      return builder;
    }
  };
}

describe('fetchOrderedImageKeys — retry transient 1x', () => {
  it('sukses langsung tanpa retry', async () => {
    const calls: string[] = [];
    clientRef.current = makeClient([{ data: [{ id: 'k1' }], error: null }], calls);
    const rows = await fetchOrderedImageKeys('prov-1');
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('Gateway Timeout di-retry 1x lalu sukses (kasus prod 12 Sep 2026)', async () => {
    const calls: string[] = [];
    clientRef.current = makeClient(
      [
        { data: null, error: { message: 'Gateway Timeout' } },
        { data: [{ id: 'k1' }], error: null }
      ],
      calls
    );
    const rows = await fetchOrderedImageKeys('prov-1');
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('error non-transient (permission) langsung throw tanpa retry', async () => {
    const calls: string[] = [];
    clientRef.current = makeClient(
      [{ data: null, error: { message: 'permission denied for table image_provider_keys' } }],
      calls
    );
    await expect(fetchOrderedImageKeys('prov-1')).rejects.toThrow(
      /fetchOrderedImageKeys: permission denied/
    );
    expect(calls).toHaveLength(1);
  });

  it('transient dua kali berturut → throw error percobaan kedua', async () => {
    const calls: string[] = [];
    clientRef.current = makeClient(
      [
        { data: null, error: { message: 'Gateway Timeout' } },
        { data: null, error: { message: 'Gateway Timeout' } }
      ],
      calls
    );
    await expect(fetchOrderedImageKeys('prov-1')).rejects.toThrow(/fetchOrderedImageKeys: Gateway Timeout/);
    expect(calls).toHaveLength(2);
  });
});
