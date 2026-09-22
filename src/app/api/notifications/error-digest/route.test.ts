import { beforeEach, describe, expect, it, vi } from 'vitest';

// MockDependencies di-*hoist* (vitet otomatis menghoist vi.mock)
const mockRunDigest = vi.fn();
vi.mock('@/lib/notifications/error-digest', () => ({
  get runErrorDigestTick() { return mockRunDigest; }
}));
vi.mock('@/lib/content/cron-auth', () => ({
  isCronAuthorized: () => true
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => ({})
}));

const { POST } = await import('./route');

describe('POST /api/notifications/error-digest', () => {
  beforeEach(() => {
    mockRunDigest.mockReset();
  });

  it('menangani POST → 200 + result digest', async () => {
    mockRunDigest.mockResolvedValueOnce({ sent: true, categories: ['llm'], eventCount: 3 });
    const req = new Request('http://localhost/api/notifications/error-digest', { method: 'POST' }) as never;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.sent).toBe(true);
    expect(json.eventCount).toBe(3);
  });
});
