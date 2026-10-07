import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_QUEUE_ATTEMPTS,
  claimDueQueueItem,
  reapStaleClaims
} from './queue';

type Row = Record<string, unknown>;

/**
 * Fake minimal untuk tabel `social_post_queue`.
 *
 * Cukup untuk membuktikan dua kontrak yang tidak bisa dilihat dari tipe:
 * klaim harus terverifikasi (0 baris = kalah lomba) dan reaper harus memakai
 * `claimed_at`, bukan `scheduled_at`.
 */
class FakeQueueQuery implements PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
  private mode: 'select' | 'update' = 'select';
  private patch: Row = {};
  private filters: Array<(row: Row) => boolean> = [];
  private limitN: number | null = null;
  private sortAsc = false;

  constructor(
    private rows: Row[],
    /** Hook uji: dijalankan tepat sebelum UPDATE, mensimulasikan proses lain yang menang lomba. */
    private beforeUpdate?: () => void
  ) {}

  update(patch: Row): this {
    this.mode = 'update';
    this.patch = patch;
    return this;
  }

  select(): this {
    return this;
  }

  insert(): Promise<{ data: null; error: null }> {
    return Promise.resolve({ data: null, error: null });
  }

  eq(col: string, value: unknown): this {
    this.filters.push((row) => row[col] === value);
    return this;
  }

  lte(col: string, value: unknown): this {
    this.filters.push((row) => row[col] != null && String(row[col]) <= String(value));
    return this;
  }

  lt(col: string, value: unknown): this {
    this.filters.push((row) => row[col] != null && String(row[col]) < String(value));
    return this;
  }

  gte(col: string, value: unknown): this {
    this.filters.push((row) => Number(row[col]) >= Number(value));
    return this;
  }

  or(expr: string): this {
    const legacy = /^claimed_at\.lt\.(.+),and\(claimed_at\.is\.null,scheduled_at\.lt\.(.+)\)$/.exec(expr);
    if (!legacy) {
      throw new Error(`FakeQueueQuery: pola or() tidak dikenal: ${expr}`);
    }
    const [, cutoff, legacyCutoff] = legacy;
    this.filters.push(
      (row) =>
        (row.claimed_at != null && String(row.claimed_at) < String(cutoff)) ||
        (row.claimed_at == null && row.scheduled_at != null && String(row.scheduled_at) < String(legacyCutoff))
    );
    return this;
  }

  order(_col: string, options?: { ascending?: boolean }): this {
    this.sortAsc = options?.ascending ?? true;
    return this;
  }

  limit(count: number): this {
    this.limitN = count;
    return this;
  }

  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> {
    const { data, error } = this.run();
    return Promise.resolve({ data: (data ?? [])[0] ?? null, error });
  }

  then<R1 = unknown, R2 = never>(
    onFulfilled?: ((value: { data: Row[] | null; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private run(): { data: Row[] | null; error: { message: string } | null } {
    if (this.mode === 'update') {
      this.beforeUpdate?.();
      const matched = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
      for (const row of matched) Object.assign(row, this.patch);
      return { data: matched, error: null };
    }
    let matched = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sortAsc) {
      matched = [...matched].sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
    }
    if (this.limitN !== null) matched = matched.slice(0, this.limitN);
    return { data: matched, error: null };
  }
}

/** `from()` selalu mengembalikan query baru — filter tidak boleh menumpuk antar panggilan. */
function makeClient(
  rows: Row[],
  hooks: { beforeUpdate?: () => void } = {}
): SupabaseClient {
  return {
    from: () => new FakeQueueQuery(rows, hooks.beforeUpdate)
  } as unknown as SupabaseClient;
}

const NOW = new Date('2026-10-07T10:00:00.000Z');

function queueRow(over: Row = {}): Row {
  return {
    id: 'q1',
    draft_id: 'draft-1',
    platform_slug: 'threads',
    account_id: null,
    lang: 'id',
    status: 'queued',
    attempts: 0,
    image_url: null,
    image_urls: null,
    scheduled_at: '2026-10-07T09:00:00.000Z',
    claimed_at: null,
    last_error: null,
    ...over
  };
}

describe('claimDueQueueItem', () => {
  it('idle bila tidak ada antrean jatuh tempo', async () => {
    const rows = [queueRow({ scheduled_at: '2026-10-08T09:00:00.000Z' })];
    const client = makeClient(rows);
    await expect(claimDueQueueItem(client, { now: NOW })).resolves.toEqual({ outcome: 'idle' });
  });

  it('mengklaim baris due: status posting, attempts +1, claimed_at terisi', async () => {
    const rows = [queueRow()];
    const client = makeClient(rows);
    const result = await claimDueQueueItem(client, { now: NOW });

    expect(result.outcome).toBe('claimed');
    expect(rows[0]?.status).toBe('posting');
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.claimed_at).toBe(NOW.toISOString());
  });

  it('raced bila invocation lain memenangkan klaim (0 baris terpengaruh, tanpa error)', async () => {
    const rows = [queueRow()];
    // Simulasi tick lain yang sudah memindahkan status ke 'posting' tepat
    // sebelum UPDATE kita dieksekusi.
    const client = makeClient(rows, {
      beforeUpdate: () => {
        rows[0]!.status = 'posting';
      }
    });

    await expect(claimDueQueueItem(client, { now: NOW })).resolves.toEqual({ outcome: 'raced' });
    expect(rows[0]?.attempts).toBe(0);
    expect(rows[0]?.claimed_at).toBeNull();
  });

  it('exhausted bila attempts sudah mencapai batas', async () => {
    const rows = [queueRow({ attempts: MAX_QUEUE_ATTEMPTS })];
    const client = makeClient(rows);
    const result = await claimDueQueueItem(client, { now: NOW });

    expect(result.outcome).toBe('exhausted');
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.last_error).toContain('max attempts');
  });
});

describe('reapStaleClaims', () => {
  it('mengembalikan klaim basi ke queued dan membersihkan claimed_at', async () => {
    const rows = [queueRow({ status: 'posting', attempts: 1, claimed_at: '2026-10-07T09:30:00.000Z' })];
    const client = makeClient(rows);

    const result = await reapStaleClaims(client, { now: NOW });

    expect(result).toEqual({ requeued: 1, failed: 0, errors: [] });
    expect(rows[0]?.status).toBe('queued');
    expect(rows[0]?.claimed_at).toBeNull();
    expect(rows[0]?.last_error).toContain('reaper');
  });

  it('menandai failed klaim basi yang attempts-nya sudah habis', async () => {
    const rows = [queueRow({ status: 'posting', attempts: MAX_QUEUE_ATTEMPTS, claimed_at: '2026-10-07T09:30:00.000Z' })];
    const client = makeClient(rows);

    const result = await reapStaleClaims(client, { now: NOW });

    expect(result).toEqual({ requeued: 0, failed: 1, errors: [] });
    expect(rows[0]?.status).toBe('failed');
  });

  it('tidak menyentuh klaim yang masih segar', async () => {
    const rows = [queueRow({ status: 'posting', attempts: 1, claimed_at: NOW.toISOString() })];
    const client = makeClient(rows);

    const result = await reapStaleClaims(client, { now: NOW });

    expect(result).toEqual({ requeued: 0, failed: 0, errors: [] });
    expect(rows[0]?.status).toBe('posting');
  });

  it('menangani baris legacy (claimed_at NULL) lewat scheduled_at', async () => {
    const rows = [queueRow({ status: 'posting', attempts: 2, claimed_at: null, scheduled_at: '2026-10-07T08:00:00.000Z' })];
    const client = makeClient(rows);

    const result = await reapStaleClaims(client, { now: NOW });

    expect(result.requeued).toBe(1);
    expect(rows[0]?.status).toBe('queued');
  });

  it('TIDAK merebut klaim baru pada baris yang dijadwalkan jauh di masa lalu', async () => {
    // Baris tertunda berhari-hari baru diklaim sekarang: patokan harus
    // claimed_at, bukan scheduled_at, agar thread yang sedang dikirim tidak
    // direbut dan dipublish dua kali.
    const rows = [
      queueRow({
        status: 'posting',
        attempts: 1,
        claimed_at: NOW.toISOString(),
        scheduled_at: '2026-10-01T02:00:00.000Z'
      })
    ];
    const client = makeClient(rows);

    const result = await reapStaleClaims(client, { now: NOW });

    expect(result).toEqual({ requeued: 0, failed: 0, errors: [] });
    expect(rows[0]?.status).toBe('posting');
  });
});
