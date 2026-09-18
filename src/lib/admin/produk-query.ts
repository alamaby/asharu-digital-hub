export const PRODUK_PAGE_SIZE = 20;

export type ProdukFilter = 'all' | 'pinned' | 'auto' | 'excluded';

const VALID_FILTERS = new Set<ProdukFilter>(['all', 'pinned', 'auto', 'excluded']);

export function parseProdukFilter(v: unknown): ProdukFilter {
  return VALID_FILTERS.has(v as ProdukFilter) ? (v as ProdukFilter) : 'all';
}

export function clampPage(v: unknown, totalPages: number): number {
  if (typeof v !== 'string') return 1;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (totalPages === 0) return 1;
  return Math.min(n, totalPages);
}

export function pageRange(page: number, pageSize = PRODUK_PAGE_SIZE): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

/** Escape `\`, `%`, dan `,` untuk ILIKE + PostgREST `.or()`. */
export function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/,/g, '\\,');
}

/**
 * Bangun string kondisional `.or(...)` untuk PostgREST:
 *   name_id.ilike.%X%,friendly_code.ilike.%X%,merchant.ilike.%X%
 * Mengembalikan null bila needle kosong agar jangan panggil `.or()`.
 */
export function buildSearchOr(needle: string): string | null {
  const q = needle.trim();
  if (!q) return null;
  const esc = escapeIlike(q);
  return `name_id.ilike.%${esc}%,friendly_code.ilike.%${esc}%,merchant.ilike.%${esc}%`;
}
