/** Helper murni daftar admin/konten: filter platform multi, sortir kolom, paginasi gabungan. */

export type KontenSortKey = 'topic' | 'platform' | 'status' | 'category' | 'provider' | 'created';
export type KontenSortDir = 'asc' | 'desc';

export interface KontenItem {
  kind: 'request' | 'draft';
  id: string;
  topic: string | null;
  platform: string | null;
  status: string;
  category: string | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
  attempts: number | null;
}

export const KONTEN_SORT_KEYS: readonly KontenSortKey[] = [
  'topic',
  'platform',
  'status',
  'category',
  'provider',
  'created'
];

export const DEFAULT_KONTEN_SORT: KontenSortKey = 'created';
export const DEFAULT_KONTEN_DIR: KontenSortDir = 'desc';

export function defaultDirFor(sort: KontenSortKey): KontenSortDir {
  return sort === 'created' ? 'desc' : 'asc';
}

function isSortKey(raw: string | undefined): raw is KontenSortKey {
  return raw === 'topic' || raw === 'platform' || raw === 'status' || raw === 'category' || raw === 'provider' || raw === 'created';
}

/**
 * Normalisasi param URL `sort` + `dir`.
 * Mendukung URL lama `?sort=newest|oldest` (dari dropdown "Urutkan" sebelum 2026-09-10).
 */
export function normalizeKontenSort(
  rawSort: string | undefined,
  rawDir: string | undefined
): { sort: KontenSortKey; dir: KontenSortDir } {
  if (rawSort === 'newest') return { sort: 'created', dir: 'desc' };
  if (rawSort === 'oldest') return { sort: 'created', dir: 'asc' };
  const sort = isSortKey(rawSort) ? rawSort : DEFAULT_KONTEN_SORT;
  const dir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : defaultDirFor(sort);
  return { sort, dir };
}

/** Parse `?platform=threads,facebook` menjadi slug valid (unik, urutan stabil). Kosong = semua. */
export function parsePlatformParam(raw: string | undefined, allowed: Set<string> | string[]): string[] {
  if (!raw) return [];
  const allowedSet = Array.isArray(allowed) ? new Set(allowed) : allowed;
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const slug = part.trim();
    if (slug && slug !== 'all' && allowedSet.has(slug)) seen.add(slug);
  }
  return [...seen];
}

function fieldValue(item: KontenItem, sort: KontenSortKey): string {
  switch (sort) {
    case 'topic':
      return item.topic ?? '';
    case 'platform':
      return item.platform ?? '';
    case 'status':
      return item.status;
    case 'category':
      return item.category ?? '';
    case 'provider':
      return [item.provider ?? '', item.model ?? ''].join(' ').trim();
    case 'created':
      return item.createdAt;
  }
}

export function compareKontenItems(
  a: KontenItem,
  b: KontenItem,
  sort: KontenSortKey,
  dir: KontenSortDir
): number {
  const cmp = fieldValue(a, sort).localeCompare(fieldValue(b, sort));
  if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  // Tie-break stabil: terbaru dulu, lalu id.
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortKontenItems<T extends KontenItem>(items: T[], sort: KontenSortKey, dir: KontenSortDir): T[] {
  return [...items].sort((a, b) => compareKontenItems(a, b, sort, dir));
}

export function paginateKonten<T>(
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
