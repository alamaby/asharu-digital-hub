/** Helper murni daftar review konten: filter multi-select + paginasi. */

export const REVIEW_STATUSES = ['needs_review', 'approved', 'rejected'] as const;
export const REVIEW_PROVIDERS = ['naraya', 'openrouter', 'gemini', 'cloudflare'] as const;

/**
 * Parse `?status=a,b&provider=c&platform=d,e` menjadi nilai valid
 * (unik, urutan stabil). Kosong/tak-valid-semua = tak difilter (semua).
 */
export function parseMultiParam(raw: string | undefined, allowed: Set<string> | readonly string[]): string[] {
  if (!raw) return [];
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (v && v !== 'all' && allowedSet.has(v)) seen.add(v);
  }
  return [...seen];
}

/** Serialisasi pilihan multi ke query string (`a,b`; kosong = param dihapus). */
export function serializeMultiParam(selected: string[]): string | undefined {
  return selected.length > 0 ? selected.join(',') : undefined;
}

export function paginateReview<T>(
  items: T[],
  page: number,
  pageSize: number
): { pageItems: T[]; page: number; totalPages: number; totalCount: number } {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, Number.isInteger(page) ? page : 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), page: safePage, totalPages, totalCount };
}
