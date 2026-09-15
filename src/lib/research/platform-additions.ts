import 'server-only';

/**
 * Sesi riset menyimpan platform terpilih di dua kolom legacy:
 * `platform_slugs` (multi/checklist baru) dan `platform_slug` (tunggal).
 * Sesi lama "Semua Platform" punya keduanya kosong dan menghasilkan draf
 * ber-`platform_slug='all'`.
 *
 * Fungsi di sini murni (tanpa I/O) supaya mudah diuji: dipakai halaman admin
 * untuk menghitung platform mana yang belum pernah dipilih pada sesi selesai,
 * sehingga admin bisa menambahkannya lalu menjalankan ulang `developing`.
 */

export interface SessionPlatformSource {
  platform_slug: string | null;
  platform_slugs?: string[] | null;
}

/** Platform nyata = slug non-kosong, bukan slug arsip 'all'. */
export function isRealPlatformSlug(slug: string | null | undefined): slug is string {
  return typeof slug === 'string' && slug.trim().length > 0 && slug !== 'all';
}

/**
 * Daftar platform efektif sesi: union `platform_slugs` ∪ `platform_slug` ∪
 * platform draf nyata. Draf `all`/null diabaikan supaya sesi agnostik lama
 * tidak dianggap sudah punya semua platform.
 */
export function resolveEffectivePlatforms(
  session: SessionPlatformSource,
  draftPlatformSlugs: Array<string | null | undefined> = []
): string[] {
  const seen = new Set<string>();
  const push = (slug: string | null | undefined) => {
    if (isRealPlatformSlug(slug)) seen.add(slug);
  };
  for (const slug of session.platform_slugs ?? []) push(slug);
  push(session.platform_slug);
  for (const slug of draftPlatformSlugs) push(slug);
  return [...seen].sort();
}

/**
 * Platform aktif yang belum tercakup sesi — kandidat untuk "Tambah platform".
 * Urutan mengikuti urutan platform aktif yang diberikan (umumnya by slug).
 */
export function computeAddablePlatforms(
  effective: string[],
  activePlatforms: Array<{ slug: string; display_name: string }>
): Array<{ slug: string; display_name: string }> {
  const covered = new Set(effective);
  return activePlatforms.filter((p) => isRealPlatformSlug(p.slug) && !covered.has(p.slug));
}

/**
 * Kolom platform sesi setelah menambah pilihan: `platform_slugs` = union,
 * `platform_slug` hanya diisi bila tepat 1 platform (aturan insert form).
 */
export function mergeSessionPlatforms(
  effective: string[],
  added: string[]
): { platform_slug: string | null; platform_slugs: string[] } {
  const merged = [...new Set([...effective, ...added].filter(isRealPlatformSlug))].sort();
  return {
    platform_slug: merged.length === 1 ? (merged[0] ?? null) : null,
    platform_slugs: merged
  };
}
