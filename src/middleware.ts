import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from '@/i18n/routing';
import {
  getLocaleFromPathname,
  isAdminRoute,
  isPublicRoute
} from '@/lib/auth/route-guards';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Rute publik: tidak ada cek auth sama sekali.
  const { pathname } = request.nextUrl;
  if (isPublicRoute(pathname)) {
    return intlResponse;
  }

  let supabaseResponse = intlResponse;
  let user: import('@supabase/supabase-js').User | null = null;
  let supabase: ReturnType<typeof createServerClient> | null = null;

  if (supabaseUrl && supabaseKey) {
    const response = intlResponse ?? NextResponse.next();
    supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        }
      }
    });
    const { data } = await supabase.auth.getUser();
    user = data.user;
    supabaseResponse = response;
  }

  const locale = getLocaleFromPathname(pathname);

  // Login guard — berlaku untuk semua rute non-publik (termasuk admin & studio).
  // Daftar rute publik/admin ada di `src/lib/auth/route-guards.ts`.
  if (!user) {
    return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
  }

  // Admin-only guard — berlapis di atas login. Non-admin → /masuk.
  if (isAdminRoute(pathname)) {
    if (!supabase) {
      return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
    }
    // profiles.is_admin = single source of truth (lihat migrasi
    // 20260901000001_consolidate_admin_auth.sql). Halaman admin tetap memanggil
    // isAdmin() sendiri sebagai lapis kedua.
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    const isAdmin = Boolean((profile as { is_admin?: boolean } | null)?.is_admin);
    if (!isAdmin) {
      return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
    }
  }

  return supabaseResponse ?? intlResponse;
}

export const config = {
  // Cocokkan semua pathname kecuali:
  // - `/api`, `/_next`, `/_vercel` (internal)
  // - path yang mengandung titik (file statis + metadata route: sitemap.xml,
  //   robots.txt, ikon)
  //
  // CATATAN: karena `.*\..*`, rute aplikasi yang mengandung titik (mis.
  // `/id/konten/review/a.b`) TIDAK melewati middleware ini. Semua halaman
  // non-publik karena itu tetap memverifikasi auth sendiri (isAdmin() /
  // requireUser()), dan tiap route API wajib punya guard sendiri — dijaga oleh
  // test invariant `src/test/api-route-guards.test.ts`.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)'
};
