import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invariant: middleware TIDAK mencakup `/api` (lihat matcher di middleware.ts),
 * jadi setiap route API wajib menjaga dirinya sendiri. Test ini gagal begitu
 * ada route baru tanpa guard — supaya tidak ada endpoint yang "terbuka karena
 * lupa", bukan karena keputusan.
 */

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

/**
 * Marker guard yang diakui:
 * - `isCronAuthorized`  → worker cron (Bearer CRON_SECRET, fail-closed di prod)
 * - `requireUser`       → wajib login
 * - `isAdmin()`         → wajib admin
 * - `auth.getUser()` / `createSupabaseServer` → cek sesi langsung
 */
const GUARD_MARKERS = [
  'isCronAuthorized',
  'requireUser',
  'isAdmin()',
  'auth.getUser(',
  'createSupabaseServer'
];

/**
 * Route yang "guard"-nya adalah kredensial sekali-pakai di dalam request itu
 * sendiri, bukan sesi/secret. Setiap pengecualian WAJIB punya alasan tertulis
 * dan file-nya harus tetap ada (lihat test pengecualian basi di bawah).
 */
const EXEMPT_ROUTES: Record<string, string> = {
  'src/app/api/auth/callback/route.ts':
    'OAuth/PKCE code exchange: kredensialnya parameter `code` sekali-pakai yang divalidasi Supabase; route ini yang MEMBUAT sesi, jadi belum ada sesi untuk dicek. Redirect `next` sudah dibatasi ke origin sendiri.'
};

function hasGuard(source: string): boolean {
  return GUARD_MARKERS.some((marker) => source.includes(marker));
}

function collectRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectRouteFiles(full, out);
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      out.push(full);
    }
  }
  return out;
}

describe('invariant guard route API', () => {
  const files = collectRouteFiles(API_DIR);

  it('menemukan seluruh route API', () => {
    expect(files.length).toBeGreaterThanOrEqual(16);
  });

  const guarded = collectRouteFiles(API_DIR)
    .map((file) => [relative(process.cwd(), file).split(sep).join('/'), file] as const)
    .filter(([label]) => !(label in EXEMPT_ROUTES));

  it.each(guarded)('%s punya guard auth', (_label, file) => {
    const source = readFileSync(file, 'utf8');
    expect(hasGuard(source), `${file} tidak memuat marker guard (${GUARD_MARKERS.join(', ')})`).toBe(true);
  });

  it('pengecualian hanya untuk file yang benar-benar ada (tidak basi)', () => {
    for (const label of Object.keys(EXEMPT_ROUTES)) {
      expect(existsSync(join(process.cwd(), label)), `${label} sudah tidak ada — hapus pengecualiannya`).toBe(true);
    }
  });

  it('detektor guard benar-benar membedakan file ber-guard dan tanpa guard', () => {
    expect(hasGuard("import { isCronAuthorized } from '@/lib/content/cron-auth';")).toBe(true);
    expect(hasGuard('export async function POST() { return new Response("ok"); }')).toBe(false);
  });
});
