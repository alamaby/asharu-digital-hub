import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const hoisted = vi.hoisted(() => ({
  authorized: { current: true },
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  claim: { current: {} as Record<string, unknown> },
  reaped: { current: { requeued: 0, failed: 0, errors: [] as string[] } },
  publish: vi.fn(),
  publishLimit: vi.fn()
}));

vi.mock('@/lib/content/cron-auth', () => ({
  isCronAuthorized: () => hoisted.authorized.current
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => ({
    from: (table: string) => new FakeTableQuery(hoisted.tables[table] ?? []),
    rpc: async () => ({ data: 'token-abc', error: null })
  })
}));

vi.mock('@/lib/social/queue', () => ({
  MAX_QUEUE_ATTEMPTS: 5,
  reapStaleClaims: async () => hoisted.reaped.current,
  claimDueQueueItem: async () => hoisted.claim.current
}));

vi.mock('@/lib/social/threads', () => ({
  publishThreadChain: (...args: unknown[]) => hoisted.publish(...args),
  fetchPublishingLimit: (...args: unknown[]) => hoisted.publishLimit(...args),
  refreshLongLivedToken: async () => 'fresh-token'
}));

/** Fake query builder minimal: cukup untuk rantai `.select().eq().maybeSingle()` dan `.update().eq()`. */
class FakeTableQuery implements PromiseLike<{ data: Row[] | null; error: { message: string } | null; count?: number }> {
  private mode: 'select' | 'update' = 'select';
  private patch: Row = {};
  private head = false;
  private filters: Array<(row: Row) => boolean> = [];
  private limitN: number | null = null;

  constructor(private rows: Row[]) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.head = Boolean(options?.head);
    if (!options?.count) this.head = false;
    return this;
  }

  update(patch: Row): this {
    this.mode = 'update';
    this.patch = patch;
    return this;
  }

  insert(): Promise<{ data: null; error: null }> {
    return Promise.resolve({ data: null, error: null });
  }

  eq(col: string, value: unknown): this {
    this.filters.push((row) => row[col] === value);
    return this;
  }

  gte(col: string, value: unknown): this {
    this.filters.push((row) => row[col] != null && String(row[col]) >= String(value));
    return this;
  }

  lte(col: string, value: unknown): this {
    this.filters.push((row) => row[col] != null && String(row[col]) <= String(value));
    return this;
  }

  order(): this {
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
    onFulfilled?: ((value: { data: Row[] | null; error: { message: string } | null; count?: number }) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private run(): { data: Row[] | null; error: { message: string } | null; count?: number } {
    const matched = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.mode === 'update') {
      for (const row of matched) Object.assign(row, this.patch);
      return { data: matched, error: null };
    }
    if (this.head) return { data: null, error: null, count: matched.length };
    return { data: this.limitN !== null ? matched.slice(0, this.limitN) : matched, error: null };
  }
}

const { POST, GET } = await import('./route');

const CONFIG = {
  platform_slug: 'threads',
  is_enabled: true,
  auto_queue_on_approve: true,
  default_lang: 'id',
  allow_lang_override: true,
  daily_cap: 25,
  post_window_start: '07:00',
  post_window_end: '21:00',
  min_interval_minutes: 60,
  account_id: null
};

const ACCOUNT = {
  id: 'acc-1',
  platform_slug: 'threads',
  handle: '@asharu.id',
  threads_user_id: 'tu-1',
  vault_secret_name: 'threads_token',
  scopes: ['threads_content_publish'],
  token_expires_at: null,
  status: 'active',
  priority: 0,
  is_active: true
};

const QUEUE_ROW = {
  id: 'q1',
  draft_id: 'draft-1',
  platform_slug: 'threads',
  account_id: null,
  lang: 'id',
  status: 'queued',
  attempts: 1,
  image_url: null,
  image_urls: null,
  scheduled_at: '2026-10-07T09:00:00.000Z',
  claimed_at: '2026-10-07T10:00:00.000Z',
  last_error: null
};

const DRAFT = {
  id: 'draft-1',
  status: 'approved',
  affiliate_injections: [] as unknown[],
  selected_image_id: null,
  generated_thread: {
    main: { id: 'Halo dunia', en: 'Hello world' },
    replies: [{ id: 'Balasan satu', en: 'Reply one' }]
  }
};

function resetTables(): void {
  hoisted.tables = {
    social_post_configs: [{ ...CONFIG }],
    social_accounts: [{ ...ACCOUNT }],
    social_post_queue: [QUEUE_ROW],
    content_drafts: [DRAFT],
    content_draft_images: [],
    social_post_logs: []
  };
}

beforeEach(() => {
  resetTables();
  hoisted.authorized.current = true;
  hoisted.reaped.current = { requeued: 0, failed: 0, errors: [] };
  hoisted.claim.current = { outcome: 'claimed', item: { ...QUEUE_ROW } };
  hoisted.publish.mockReset();
  hoisted.publish.mockImplementation(async (_fetch: unknown, params: { onPost: (i: number, r: { containerId: string; mediaId: string }) => Promise<void> }) => {
    await params.onPost(0, { containerId: 'container-1', mediaId: 'media-1' });
    return [{ containerId: 'container-1', mediaId: 'media-1' }];
  });
  hoisted.publishLimit.mockReset();
  hoisted.publishLimit.mockResolvedValue({ quotaUsage: null });
});

describe('POST /api/social/post (guard == CRON_SECRET)', () => {
  it('401 bila Bearer tidak valid', async () => {
    hoisted.authorized.current = false;
    const res = await POST(new Request('http://localhost/api/social/post', { method: 'POST' }) as never);
    expect(res.status).toBe(401);
    expect(hoisted.publish).not.toHaveBeenCalled();
  });

  it('tidak mem-publish apa pun saat klaim kalah lomba (raced)', async () => {
    hoisted.claim.current = { outcome: 'raced' };
    const res = await POST(new Request('http://localhost/api/social/post', { method: 'POST' }) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ idle: true, raced: true });
    expect(hoisted.publish).not.toHaveBeenCalled();
    expect(hoisted.tables.social_post_queue?.[0]?.status).toBe('queued');
  });

  it('idle tanpa antrean jatuh tempo', async () => {
    hoisted.claim.current = { outcome: 'idle' };
    hoisted.reaped.current = { requeued: 2, failed: 0, errors: [] };
    const res = await POST(new Request('http://localhost/api/social/post', { method: 'POST' }) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ idle: true, requeued: 2 });
    expect(hoisted.publish).not.toHaveBeenCalled();
  });

  it('alur sukses: publish sekali lalu tandai queue posted + claimed_at dibersihkan', async () => {
    const res = await POST(new Request('http://localhost/api/social/post', { method: 'POST' }) as never);

    expect(res.status).toBe(200);
    // `posts` = jumlah post dalam rantai yang dikirim tick ini (opener + 1 reply).
    await expect(res.json()).resolves.toMatchObject({ posted: true, posts: 2 });
    expect(hoisted.publish).toHaveBeenCalledTimes(1);
    const [, params] = hoisted.publish.mock.calls[0] as [unknown, { texts: string[] }];
    expect(params.texts).toEqual(['Halo dunia', 'Balasan satu']);

    const queueRow = hoisted.tables.social_post_queue?.[0];
    expect(queueRow?.status).toBe('posted');
    expect(queueRow?.claimed_at).toBeNull();
    expect(queueRow?.posted_url).toBe('https://www.threads.com/@asharu.id/post/media-1');
  });

  it('GET memakai jalur yang sama (cron pg_net memakai POST/GET bebas)', async () => {
    hoisted.claim.current = { outcome: 'idle' };
    const res = await GET(new Request('http://localhost/api/social/post') as never);
    expect(res.status).toBe(200);
  });
});
