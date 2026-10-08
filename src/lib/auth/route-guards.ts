import { routing } from '@/i18n/routing';

/**
 * Klasifikasi rute non-publik — SATU sumber kebenaran untuk middleware dan test.
 *
 * - PUBLIC   → tidak ada cek auth sama sekali.
 * - LOGIN    → user login apa pun boleh (default untuk semua rute non-publik).
 * - ADMIN    → butuh `profiles.is_admin`.
 *
 * Kecocokan berbasis prefix supaya anak rute ikut terjaga
 * (`/admin/riset/[sessionId]` tertutup oleh `/admin`).
 *
 * Struktur folder `src/app/[locale]/(admin)` harus tetap konsisten dengan daftar
 * ini: `src/test/route-classification.test.ts` gagal bila ada halaman baru yang
 * belum diklasifikasikan (supaya halaman tidak "diam-diam" login-only).
 */

/** Halaman/route yang boleh diakses tanpa login. */
export const PUBLIC_INTERNAL_PATHS: readonly string[] = [
  '/products',
  '/properties',
  '/artikel',
  '/about',
  '/digital-hub',
  '/privacy-policy',
  '/affiliate-disclosure',
  '/masuk',
  '/auth/exchange'
];

/**
 * Route yang sengaja cukup login (bukan admin): area milik user.
 * Didaftarkan eksplisit supaya perbedaan "login-only" vs "belum diklasifikasi"
 * terlihat jelas di review.
 */
export const LOGIN_ONLY_INTERNAL_PATHS: readonly string[] = [
  '/studio',
  '/lab',
  '/konten/baru'
];

/**
 * Route admin-only. `/konten/review` dan `/konten/riset` ada di grup `(admin)`
 * tetapi bukan di bawah `/admin`, jadi harus didaftarkan terpisah.
 */
export const ADMIN_INTERNAL_PATHS: readonly string[] = [
  '/admin',
  '/konten/review',
  '/konten/riset'
];

export type RouteClass = 'public' | 'login' | 'admin';

/** Hapus prefix `/{locale}`: `/id/produk` → `/produk`, `/en` → `/`. */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length) || '/';
    }
  }
  return pathname;
}

/** Locale dari pathname — untuk target redirect. */
export function getLocaleFromPathname(pathname: string): (typeof routing.locales)[number] {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return locale;
  }
  return routing.defaultLocale;
}

function buildReversePathnames(): Record<string, string> {
  const map: Record<string, string> = {};
  const pathnames = routing.pathnames as Record<string, string | Partial<Record<string, string>>>;
  for (const [internal, localized] of Object.entries(pathnames)) {
    if (typeof localized === 'string') {
      // Sama untuk semua locale (mis. '/' atau '/auth/exchange').
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

const localizedToInternal: Record<string, string> = buildReversePathnames();

/**
 * Terjemahkan pathname terlokalisasi (tanpa prefix locale) kembali ke kunci
 * internal (Inggris): `localizeToInternal('/produk')` → `/products`.
 */
export function localizeToInternal(localized: string): string {
  if (localized === '/' || localized === '') return '/';
  const normalized = localized.replace(/\/+$/, '');
  for (const [locKey, internal] of Object.entries(localizedToInternal)) {
    const nk = locKey.replace(/\/+$/, '');
    // Root ('/' → '/') dilewati: callers menangani root secara eksplisit.
    if (nk === '') continue;
    if (normalized === nk || normalized.startsWith(`${nk}/`)) {
      return `${internal}${normalized.slice(nk.length)}`;
    }
  }
  return localized;
}

function matchesPrefix(internalPath: string, prefixes: readonly string[]): boolean {
  const normalized = internalPath.replace(/\/+$/, '') || '/';
  return prefixes.some((prefix) => {
    if (prefix === '/') return normalized === '/';
    const normalizedPrefix = prefix.replace(/\/+$/, '');
    return normalized === normalizedPrefix || normalized.startsWith(`${normalizedPrefix}/`);
  });
}

/** Bentuk internal (kunci Inggris) dari sebuah pathname request. */
export function toInternalPath(pathname: string): string {
  const stripped = stripLocalePrefix(pathname);
  if (stripped === '/') return '/';
  return localizeToInternal(stripped);
}

export function isPublicRoute(pathname: string): boolean {
  const internal = toInternalPath(pathname);
  if (internal === '/') return true;
  return matchesPrefix(internal, PUBLIC_INTERNAL_PATHS);
}

export function isAdminRoute(pathname: string): boolean {
  const internal = toInternalPath(pathname);
  if (internal === '/') return false;
  return matchesPrefix(internal, ADMIN_INTERNAL_PATHS);
}

export function isLoginOnlyRoute(pathname: string): boolean {
  const internal = toInternalPath(pathname);
  if (internal === '/') return false;
  return matchesPrefix(internal, LOGIN_ONLY_INTERNAL_PATHS);
}

/** Kelas efektif sebuah rute; non-publik non-admin = wajib login (default). */
export function getRouteClass(pathname: string): RouteClass {
  if (isPublicRoute(pathname)) return 'public';
  if (isAdminRoute(pathname)) return 'admin';
  return 'login';
}
