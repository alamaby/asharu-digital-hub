import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

/**
 * Public (login-exempt) internal pathnames (language-agnostic keys from
 * `routing.pathnames`). The incoming request URL is localized (e.g.
 * `/id/produk`), so we first translate it back to its internal form via
 * `localizePathname` — e.g. both `/id/produk` and `/en/products` reduce to
 * `/products` — then check membership here.
 *
 * Dynamic children are covered by prefix match: `/properties/[slug]`
 * (localized `/id/properti/rumah-x`) is matched because the internal
 * `/properties` prefix starts-with check catches it.
 */
const PUBLIC_INTERNAL_PATHS: readonly string[] = [
  '/products',
  '/properties',
  '/about',
  '/privacy-policy',
  '/affiliate-disclosure',
  '/masuk',
  '/auth/exchange'
];

/**
 * Admin-only internal pathnames (stricter than login — requires is_admin).
 * Checked AFTER the login guard so a non-admin logged-in user still gets
 * redirected to `/masuk` (consistent single entry point). Prefix-matched like
 * public routes so child routes (e.g. `/admin/riset/[id]`) are covered.
 */
const ADMIN_INTERNAL_PATHS: readonly string[] = [
  '/admin',
  '/konten/review',
  '/konten/riset'
];

/** Strip the `/{locale}` prefix: `/id/produk` -> `/produk`, `/en` -> `/`. */
function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length) || '/';
    }
  }
  return pathname;
}

/** Derive the matching locale from the pathname for redirect targets. */
function getLocale(pathname: string): (typeof routing.locales)[number] {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return locale;
  }
  return routing.defaultLocale;
}

/**
 * Translate a locale-stripped, localized pathname back to its internal
 * (English) key using the reverse of `routing.pathnames`.
 *
 * Example: `localizeToInternal('/produk')` → `/products`
 *          `localizeToInternal('/properti/rumah-x')` → `/properties/rumah-x`
 */
const localizedToInternal: Record<string, string> = buildReversePathnames();

function buildReversePathnames(): Record<string, string> {
  const map: Record<string, string> = {};
  const pathnames = routing.pathnames as Record<string, string | Partial<Record<string, string>>>;
  for (const [internal, localized] of Object.entries(pathnames)) {
    if (typeof localized === 'string') {
      // Same path for all locales (e.g. '/' or '/auth/exchange').
      map[localized] = internal;
    } else {
      for (const locale of routing.locales) {
        const locPath = localized[locale as never];
        if (locPath) map[locPath] = internal;
      }
    }
  }
  return map;
}

function localizeToInternal(localized: string): string {
  if (localized === '/' || localized === '') return '/';
  const normalized = localized.replace(/\/+$/, '');
  for (const [locKey, internal] of Object.entries(localizedToInternal)) {
    const nk = locKey.replace(/\/+$/, '');
    // Skip the root mapping ('/' → '/') for prefix matching; the exact root
    // is handled by callers (isPublicRoute returns true for '/').
    if (nk === '') continue;
    if (normalized === nk || normalized.startsWith(`${nk}/`)) {
      return `${internal}${normalized.slice(nk.length)}`;
    }
  }
  return localized;
}

/** True when the pathname is in the public whitelist (after locale normalization). */
function isPublicRoute(pathname: string): boolean {
  const stripped = stripLocalePrefix(pathname);
  if (stripped === '/') return true;
  const internal = localizeToInternal(stripped);
  const normalized = internal.replace(/\/+$/, '');
  return PUBLIC_INTERNAL_PATHS.some((pub) => {
    if (pub === '/') return false;
    const normalizedPub = pub.replace(/\/+$/, '');
    return normalized === normalizedPub || normalized.startsWith(`${normalizedPub}/`);
  });
}

/** True when the pathname falls under an admin-only internal prefix. */
function isAdminRoute(pathname: string): boolean {
  const stripped = stripLocalePrefix(pathname);
  if (stripped === '/' || stripped === '') return false;
  const internal = localizeToInternal(stripped);
  const normalized = internal.replace(/\/+$/, '');
  return ADMIN_INTERNAL_PATHS.some((admin) => {
    const normalizedAdmin = admin.replace(/\/+$/, '');
    return normalized === normalizedAdmin || normalized.startsWith(`${normalizedAdmin}/`);
  });
}

export default async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Public routes: no auth check at all.
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

  const locale = getLocale(pathname);

  // Login guard — applies to every non-public route (including admin and studio).
  if (!user) {
    return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
  }

  // Admin-only guard — layered on top of login. Non-admin → /masuk.
  if (isAdminRoute(pathname)) {
    if (!supabase) {
      return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
    }
    // profiles.is_admin is the single source of truth — see migration
    // 20260901000001_consolidate_admin_auth.sql.
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
  // Match all pathnames except:
  // - `/api`, `/_next`, `/_vercel` internals
  // - any path containing a dot (static files: sitemap.xml, robots.txt,
  //   icons, images, generated metadata routes)
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)'
};
