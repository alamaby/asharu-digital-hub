import type { ArticleLocale } from './types';

/**
 * Pure helpers untuk publish artikel (dipisah dari server action agar
 * mudah di-test tanpa mock Supabase).
 */

/** Slug unik: tambah suffix -2, -3, ... bila sudah dipakai locale tsb. */
export function resolveUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/**
 * Bahasa yang boleh dipublish = irisan request dengan bahasa sesi.
 * Sesi null/both → keduanya boleh; sesi tunggal → hanya itu.
 */
export function selectPublishLocales(
  sessionLanguage: string | null,
  requested: ArticleLocale[]
): { locales: ArticleLocale[] } | { error: string } {
  const allowed: ArticleLocale[] =
    !sessionLanguage || sessionLanguage === 'both' ? ['id', 'en'] : sessionLanguage === 'en' ? ['en'] : ['id'];
  const bad = requested.filter((r) => !allowed.includes(r));
  if (bad.length > 0) {
    return { error: `bahasa sesi (${allowed.join('/')}) tidak mencakup: ${bad.join(', ')}` };
  }
  const unique = [...new Set(requested)];
  if (unique.length === 0) return { error: 'pilih minimal 1 bahasa' };
  return { locales: unique };
}
