import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/content/cron-auth', () => ({
  isCronAuthorized: () => true
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => ({})
}));

vi.mock('@/lib/notifications/error-events', () => ({
  reportError: vi.fn().mockResolvedValue(undefined)
}));

const { reportError } = await import('@/lib/notifications/error-events');
const { POST } = await import('./route');

describe('POST /api/notifications/report', () => {
  beforeEach(() => {
    (reportError as ReturnType<typeof vi.fn>).mockClear();
  });

  it('payload valid → 200 { ok: true }', async () => {
    const req = new Request('http://localhost/api/notifications/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'scrape', source: 'github-actions', message: 'sync failed'
      })
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(reportError).toHaveBeenCalled();
  });

  it('kategori invalid → 400', async () => {
    const req = new Request('http://localhost/api/notifications/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'bogus', source: 'x', message: 'y' })
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('message kosong → 400', async () => {
    const req = new Request('http://localhost/api/notifications/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'scrape', source: 'x', message: '' })
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('body bukan JSON → 400', async () => {
    const req = new Request('http://localhost/api/notifications/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json'
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('severity default error bila tidak disertakan', async () => {
    const req = new Request('http://localhost/api/notifications/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'scrape', source: 'x', message: 'ok' })
    }) as never;
    await POST(req);
    const callArgs = (reportError as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs?.[1]?.severity).toBe('error');
  });
});
