import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockFrom = vi.fn();

// Mock next-intl: createMiddleware(...) returns a passthrough middleware
// function (we test auth guard logic, not intl routing).
const intlMiddlewareImpl = vi.fn(async () => NextResponse.next());

vi.mock('next-intl/middleware', () => ({
  default: () => intlMiddlewareImpl
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom
  }))
}));

// NOTE: We do NOT mock @/i18n/routing — the real routing config already
// defines locales ['id','en'] with defaultLocale 'id'.

async function loadMiddleware() {
  const mod = await import('@/middleware');
  return mod.default as typeof import('@/middleware').default;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_placeholder_key';
  intlMiddlewareImpl.mockImplementation(async () => NextResponse.next());
});

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://asharu.id${pathname}`);
}

describe('middleware auth guard', () => {
  // ── public routes (anon allowed) ───────────────────────────────────

  const publicRoutes = [
    '/',
    '/id',
    '/en',
    '/id/produk',
    '/en/products',
    '/id/properti',
    '/en/properties',
    '/id/properti/rumah-kamarasan',
    '/en/properties/rumah-kamarasan',
    '/id/tentang',
    '/en/about',
    '/id/kebijakan-privasi',
    '/en/privacy-policy',
    '/id/disclosure-afiliasi',
    '/en/affiliate-disclosure',
    '/id/masuk',
    '/en/sign-in',
    '/id/autentikasi/pertukaran',
    '/en/auth/exchange'
  ];

  for (const route of publicRoutes) {
    it(`allows anonymous access to ${route}`, async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const handler = await loadMiddleware();
      const res = await handler(makeRequest(route));
      // Must NOT redirect to /masuk
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  }

  // ── login-only routes (anon → redirect) ────────────────────────────

  const loginOnlyRoutes = [
    '/id/studio',
    '/en/studio',
    '/id/konten/baru',
    '/en/content/new'
  ];

  for (const route of loginOnlyRoutes) {
    it(`redirects anonymous to /masuk for ${route}`, async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const handler = await loadMiddleware();
      const res = await handler(makeRequest(route));
      const locale = route.startsWith('/en') ? 'en' : 'id';
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        `https://asharu.id/${locale}/masuk`
      );
    });
  }

  it('allows logged-in user to access /id/studio', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/studio'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows logged-in user to access /id/konten/baru', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/konten/baru'));
    expect(res.headers.get('location')).toBeNull();
  });

  // ── admin-only routes ──────────────────────────────────────────────

  it('allows admin to access /id/admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: true } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/admin'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects non-admin to /masuk for /id/admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: false } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/admin'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://asharu.id/id/masuk');
  });

  it('redirects anonymous to /masuk for /id/admin (not profile lookup)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/admin'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://asharu.id/id/masuk');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('redirects non-admin to /masuk for /id/konten/review', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: false } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/konten/review'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://asharu.id/id/masuk');
  });

  it('redirects non-admin to /masuk for /id/konten/review/abc', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: false } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/konten/review/abc'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://asharu.id/id/masuk');
  });

  it('redirects non-admin to /masuk for /id/konten/riset/session-1 (child route)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { is_admin: false } });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) })
    });
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/konten/riset/session-1'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://asharu.id/id/masuk');
  });

  // ── supabase not configured ───────────────────────────────────────

  it('redirects to /masuk when supabase env is missing and route is private', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/studio'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://asharu.id/id/masuk');
  });

  it('still allows public routes when supabase env is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const handler = await loadMiddleware();
    const res = await handler(makeRequest('/id/produk'));
    expect(res.status).toBe(200);
  });
});
