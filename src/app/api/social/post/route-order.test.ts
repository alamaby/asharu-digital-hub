import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

const hoisted = vi.hoisted(() => ({
  rpc: vi.fn(),
  fetchSpy: vi.fn(),
  reap: vi.fn(),
  claim: vi.fn()
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

class FakeTableQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
  constructor(private rows: Row[]) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  async maybeSingle() {
    return { data: this.rows[0] ?? null, error: null };
  }
  then<TResult1 = { data: Row[] | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => ({
    from: (table: string) => {
      if (table === 'social_post_configs') return new FakeTableQuery([mockConfig]);
      if (table === 'social_accounts') return new FakeTableQuery([mockAccount]);
      return new FakeTableQuery([]);
    },
    rpc: hoisted.rpc
  })
}));

vi.mock('@/lib/social/queue', () => ({
  MAX_QUEUE_ATTEMPTS: 5,
  reapStaleClaims: hoisted.reap,
  claimDueQueueItem: hoisted.claim
}));

const { POST } = await import('./route');

describe('/api/social/post route execution order', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', hoisted.fetchSpy);
    hoisted.rpc.mockReset();
    hoisted.fetchSpy.mockReset();
    hoisted.reap.mockReset();
    hoisted.claim.mockReset();
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
});
