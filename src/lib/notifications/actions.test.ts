import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pattern mengikuti actions.article-edit.test.ts: hoisted getter mocks
const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({ get revalidatePath() { return revalidatePathMock; } }));

const isAdminMock = vi.fn(() => Promise.resolve(true));
vi.mock('@/lib/auth/is-admin', () => ({ get isAdmin() { return isAdminMock; } }));

let svcClient: never | null = null;
vi.mock('@/lib/supabase/server', () => ({
  get createSupabaseService() {
    return () => svcClient;
  }
}));

const { updateErrorNotificationConfig } = await import('./actions');

describe('updateErrorNotificationConfig', () => {
  beforeEach(() => {
    revalidatePathMock.mockResolvedValue(undefined);
    isAdminMock.mockResolvedValue(true);
    svcClient = null;
  });

  function makeMockClient(updateErr: unknown = null) {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: updateErr })
    };
    svcClient = {
      from: vi.fn(() => chain)
    } as never;
    return chain;
  }

  it('window 3 → fail (di bawah 5)', async () => {
    const fd = new FormData();
    fd.set('category', 'llm');
    fd.set('is_enabled', 'on');
    fd.set('digest_window_minutes', '3');
    fd.set('notify_emails', '');
    const res = await updateErrorNotificationConfig(fd);
    expect(res.ok).toBe(false);
  });

  it('window 2000 → fail (di atas 1440)', async () => {
    const fd = new FormData();
    fd.set('category', 'llm');
    fd.set('is_enabled', 'on');
    fd.set('digest_window_minutes', '2000');
    fd.set('notify_emails', '');
    const res = await updateErrorNotificationConfig(fd);
    expect(res.ok).toBe(false);
  });

  it('kategori bogus → fail', async () => {
    const fd = new FormData();
    fd.set('category', 'bogus');
    fd.set('is_enabled', 'on');
    fd.set('digest_window_minutes', '30');
    fd.set('notify_emails', '');
    const res = await updateErrorNotificationConfig(fd);
    expect(res.ok).toBe(false);
  });

  it('email bukan-email → fail sebutkan nilai', async () => {
    const fd = new FormData();
    fd.set('category', 'llm');
    fd.set('is_enabled', 'on');
    fd.set('digest_window_minutes', '30');
    fd.set('notify_emails', 'bukan-email');
    const res = await updateErrorNotificationConfig(fd);
    expect(res.ok).toBe(false);
  });

  it('input valid → ok + pesan tersimpan', async () => {
    makeMockClient(null);
    const fd = new FormData();
    fd.set('category', 'llm');
    fd.set('is_enabled', 'on');
    fd.set('digest_window_minutes', '15');
    fd.set('notify_emails', 'a@x.id, b@x.id');
    const res = await updateErrorNotificationConfig(fd);
    expect(res.ok).toBe(true);
  });

  it('emails kosong → ok + notify_emails null', async () => {
    makeMockClient(null);
    const fd = new FormData();
    fd.set('category', 'scrape');
    fd.set('is_enabled', 'off');
    fd.set('digest_window_minutes', '60');
    fd.set('notify_emails', '');
    const res = await updateErrorNotificationConfig(fd);
    expect(res.ok).toBe(true);
  });
});
