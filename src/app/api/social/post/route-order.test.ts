import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

const hoisted = vi.hoisted(() => ({
  rpc: vi.fn(),
  fetchSpy: vi.fn(),
  reap: vi.fn(),
  claim: vi.fn(),
  queueUpdates: [] as Array<{ patch: Row; id: unknown }>,
  postedCount: 0 as number,
  quotaUsage: null as number | null
}));

vi.mock('@/lib/content/cron-auth', () => ({
  isCronAuthorized: () => true
}));

const mockConfig: Row = {
  id: 'cfg-1',
  platform_slug: 'threads',
  is_enabled: true,
  daily_cap: 25,
  account_id: 'acc-1'
};

const mockAccount: Row = {
  id: 'acc-1',
  platform_slug: 'threads',
  handle: '@asharu.id',
  threads_user_id: 't-user-1',
  vault_secret_name: 'threads_access_token',
  token_suffix: '1234',
  token_expires_at: '2099-01-01T00:00:00Z',
  status: 'active',
  is_active: true,
  priority: 10,
  scopes: []
};

class FakeTableQuery implements PromiseLike<{ data: Row[] | null; error: null; count?: number }> {
  private patch: Row | null = null;
  private idFilter: unknown = null;
  constructor(
    private rows: Row[],
    private table: string = ''
  ) {}
  select() {
    return this;
  }
  eq(col: string, value: unknown) {
    if (this.patch && col === 'id') this.idFilter = value;
    return this;
  }
  gte() {
    return this;
  }
  lte() {
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  async maybeSingle() {
    return { data: this.rows[0] ?? null, error: null };
  }
  then<TResult1 = { data: Row[] | null; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    if (this.patch) {
      if (this.table === 'social_post_queue') {
        hoisted.queueUpdates.push({ patch: this.patch, id: this.idFilter });
      }
      return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
    }
    if (this.table === 'social_post_queue' && hoisted.postedCount !== 0) {
      return Promise.resolve({ data: this.rows, error: null, count: hoisted.postedCount }).then(
        onfulfilled,
        onrejected
      );
    }
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => ({
    from: (table: string) => {
      if (table === 'social_post_configs') return new FakeTableQuery([mockConfig], table);
      if (table === 'social_accounts') return new FakeTableQuery([mockAccount], table);
      return new FakeTableQuery([], table);
    },
    rpc: hoisted.rpc
  })
}));

vi.mock('@/lib/social/queue', () => ({
  MAX_QUEUE_ATTEMPTS: 5,
  reapStaleClaims: hoisted.reap,
  claimDueQueueItem: hoisted.claim
}));

vi.mock('@/lib/social/threads', () => ({
  fetchPublishingLimit: vi.fn(async () => ({ quotaUsage: hoisted.quotaUsage })),
  publishThreadChain: vi.fn(),
  refreshLongLivedToken: vi.fn()
}));

const { POST } = await import('./route');

describe('/api/social/post route execution order', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', hoisted.fetchSpy);
    hoisted.rpc.mockReset();
    hoisted.fetchSpy.mockReset();
    hoisted.reap.mockReset();
    hoisted.claim.mockReset();
    hoisted.queueUpdates.length = 0;
    hoisted.postedCount = 0;
    hoisted.quotaUsage = null;
  });

  it('idle tick does not decrypt Vault or call Meta network APIs', async () => {
    hoisted.reap.mockResolvedValueOnce({ requeued: 0, failed: 0, errors: [] });
    hoisted.claim.mockResolvedValueOnce({ outcome: 'idle' });

    const req = new NextRequest('http://localhost/api/social/post', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ idle: true, requeued: 0 });

    // Assert idle short-circuit: Vault RPC dan fetch tidak disentuh sama sekali
    expect(hoisted.rpc).not.toHaveBeenCalled();
    expect(hoisted.fetchSpy).not.toHaveBeenCalled();
  });

  it('daily cap reached does not consume queue claim', async () => {
    hoisted.postedCount = 25;
    hoisted.reap.mockResolvedValueOnce({ requeued: 0, failed: 0, errors: [] });

    const req = new NextRequest('http://localhost/api/social/post', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ skipped: 'daily cap reached (25)' });
    expect(hoisted.claim).not.toHaveBeenCalled();
    expect(hoisted.rpc).not.toHaveBeenCalled();
  });

  it('releases claim to queued when Vault token missing after claim', async () => {
    hoisted.reap.mockResolvedValueOnce({ requeued: 0, failed: 0, errors: [] });
    hoisted.claim.mockResolvedValueOnce({
      outcome: 'claimed',
      item: { id: 'q-1', draft_id: 'd-1', platform_slug: 'threads', account_id: 'acc-1', lang: 'id', status: 'posting', attempts: 1, image_url: null, image_urls: null }
    });
    hoisted.rpc.mockResolvedValueOnce({ data: null, error: null });

    const req = new NextRequest('http://localhost/api/social/post', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ error: 'threads token not in Vault — run seed-threads-token' });
    expect(hoisted.queueUpdates).toEqual([
      { patch: { status: 'queued', claimed_at: null, last_error: 'threads token not in Vault — run seed-threads-token' }, id: 'q-1' }
    ]);
  });

  it('releases claim to queued when Meta quota exhausted after claim', async () => {
    hoisted.reap.mockResolvedValueOnce({ requeued: 0, failed: 0, errors: [] });
    hoisted.claim.mockResolvedValueOnce({
      outcome: 'claimed',
      item: { id: 'q-2', draft_id: 'd-1', platform_slug: 'threads', account_id: 'acc-1', lang: 'id', status: 'posting', attempts: 1, image_url: null, image_urls: null }
    });
    hoisted.rpc.mockResolvedValueOnce({ data: 'tok-123', error: null });
    hoisted.quotaUsage = 250;

    const req = new NextRequest('http://localhost/api/social/post', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toEqual({ error: 'threads publishing quota exhausted (250/24h)' });
    expect(hoisted.queueUpdates).toEqual([
      { patch: { status: 'queued', claimed_at: null, last_error: 'threads publishing quota exhausted (250/24h)' }, id: 'q-2' }
    ]);
  });
});
