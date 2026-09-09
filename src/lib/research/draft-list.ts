/** Sortir + paginasi daftar draf sesi riset (dipakai halaman admin/riset/[sessionId]). */

export type DraftSortKey = 'newest' | 'oldest' | 'platform' | 'status';

export interface SortableDraft {
  id: string;
  platform_slug: string | null;
  status: string;
  created_at: string;
}

export const DRAFT_PAGE_SIZE = 5;

export function normalizeDraftSort(raw: string | undefined): DraftSortKey {
  return raw === 'oldest' || raw === 'platform' || raw === 'status' ? raw : 'newest';
}

function byNewest(a: SortableDraft, b: SortableDraft): number {
  if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1;
  return a.created_at < b.created_at ? 1 : -1;
}

export function sortDrafts<T extends SortableDraft>(drafts: T[], sort: string | undefined): T[] {
  const key = normalizeDraftSort(sort);
  const arr = [...drafts];
  switch (key) {
    case 'oldest':
      return arr.sort((a, b) => -byNewest(a, b));
    case 'platform':
      return arr.sort(
        (a, b) => (a.platform_slug ?? 'all').localeCompare(b.platform_slug ?? 'all') || byNewest(a, b)
      );
    case 'status':
      return arr.sort((a, b) => a.status.localeCompare(b.status) || byNewest(a, b));
    case 'newest':
    default:
      return arr.sort(byNewest);
  }
}

export function paginateDrafts<T>(items: T[], page: number, pageSize = DRAFT_PAGE_SIZE): { pageItems: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, Number.isInteger(page) ? page : 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), page: safePage, totalPages };
}
