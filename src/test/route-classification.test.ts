import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_INTERNAL_PATHS,
  LOGIN_ONLY_INTERNAL_PATHS,
  PUBLIC_INTERNAL_PATHS,
  isAdminRoute,
  isLoginOnlyRoute,
  isPublicRoute
} from '@/lib/auth/route-guards';

/**
 * Invariant: setiap halaman di grup `[locale]/(admin)` harus punya kelas yang
 * EKSPLISIT (publik / login-only / admin). Tanpa ini, halaman baru otomatis
 * "wajib login" (default middleware) tanpa ada yang menyadari — atau lebih
 * buruk, tampak publik padahal bukan.
 *
 * Segmen dinamis (`[sessionId]`, `[slug]`, ...) dilewati karena tertutup oleh
 * aturan prefix induknya.
 */

const ADMIN_GROUP_DIR = join(process.cwd(), 'src', 'app', '[locale]', '(admin)');

function collectPageDirs(dir: string, out: string[] = []): string[] {
  if (existsSync(join(dir, 'page.tsx'))) out.push(dir);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) collectPageDirs(join(dir, entry.name), out);
  }
  return out;
}

function toInternalPath(dir: string): string {
  const rel = relative(ADMIN_GROUP_DIR, dir).split(sep).join('/');
  return `/${rel}`;
}

const pageDirs = collectPageDirs(ADMIN_GROUP_DIR).map(toInternalPath);
const staticPageDirs = pageDirs.filter((p) => !p.includes('['));

describe('klasifikasi halaman grup (admin)', () => {
  it('menemukan halaman-halaman non-publik', () => {
    expect(staticPageDirs.length).toBeGreaterThanOrEqual(15);
  });

  it.each(staticPageDirs.map((p) => [p]))('%s terklasifikasi eksplisit', (internalPath) => {
    const classified =
      isPublicRoute(`/id${internalPath}`) ||
      isLoginOnlyRoute(`/id${internalPath}`) ||
      isAdminRoute(`/id${internalPath}`);
    expect(
      classified,
      `${internalPath} belum masuk PUBLIC_INTERNAL_PATHS, LOGIN_ONLY_INTERNAL_PATHS, atau ADMIN_INTERNAL_PATHS`
    ).toBe(true);
  });

  it('setiap halaman di bawah /admin adalah admin (bukan login-only)', () => {
    for (const internalPath of staticPageDirs.filter((p) => p.startsWith('/admin'))) {
      expect(isAdminRoute(`/id${internalPath}`), internalPath).toBe(true);
      expect(isLoginOnlyRoute(`/id${internalPath}`), internalPath).toBe(false);
    }
  });

  it('daftar login-only tidak menyentuh area publik maupun admin', () => {
    for (const prefix of LOGIN_ONLY_INTERNAL_PATHS) {
      expect(PUBLIC_INTERNAL_PATHS, prefix).not.toContain(prefix);
      expect(ADMIN_INTERNAL_PATHS, prefix).not.toContain(prefix);
    }
  });
});
