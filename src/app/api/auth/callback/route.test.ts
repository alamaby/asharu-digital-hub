import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeCodeForSession = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args) }
  })
}));

const { GET } = await import('./route');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockResolvedValue({ error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_placeholder_value';
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
});

function request(query: string) {
  return new Request(`https://asharu.id/api/auth/callback${query}`) as never;
}

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

describe('GET /api/auth/callback', () => {
  it('tanpa code → redirect ke /id/masuk', async () => {
    const res = await GET(request(''));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe('https://asharu.id/id/masuk');
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('code valid + next internal → redirect ke path internal', async () => {
    const res = await GET(request('?code=abc&next=/en/content/review'));
    expect(locationOf(res)).toBe('https://asharu.id/en/content/review');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('open redirect diblokir: next absolut tetap di origin sendiri', async () => {
    const res = await GET(request('?code=abc&next=https%3A%2F%2Fevil.example%2Fphish'));
    expect(locationOf(res)).toBe('https://asharu.id/id/konten/review');
  });

  it('open redirect diblokir: next protocol-relative', async () => {
    const res = await GET(request('?code=abc&next=%2F%2Fevil.example'));
    expect(locationOf(res)).toBe('https://asharu.id/id/konten/review');
  });

  it('default next saat tidak diisi', async () => {
    const res = await GET(request('?code=abc'));
    expect(locationOf(res)).toBe('https://asharu.id/id/konten/review');
  });

  it('exchange gagal → redirect ke /id/masuk?error=exchange_failed', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid code' } });
    const res = await GET(request('?code=bad'));
    expect(locationOf(res)).toBe('https://asharu.id/id/masuk?error=exchange_failed');
  });

  it('env Supabase belum diisi → redirect ke /id/masuk tanpa memanggil exchange', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';
    const res = await GET(request('?code=abc'));
    expect(locationOf(res)).toBe('https://asharu.id/id/masuk');
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
