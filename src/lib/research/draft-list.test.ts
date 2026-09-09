import { describe, expect, it } from 'vitest';
import { sortDrafts, paginateDrafts, normalizeDraftSort, DRAFT_PAGE_SIZE } from './draft-list';

const drafts = [
  { id: 'd1', platform_slug: 'twitter', status: 'approved', created_at: '2026-09-08T10:00:00Z' },
  { id: 'd2', platform_slug: 'threads', status: 'needs_review', created_at: '2026-09-09T10:00:00Z' },
  { id: 'd3', platform_slug: 'threads', status: 'approved', created_at: '2026-09-07T10:00:00Z' }
];

describe('draft-list', () => {
  it('defaults unknown sort to newest', () => {
    expect(normalizeDraftSort(undefined)).toBe('newest');
    expect(normalizeDraftSort('bogus')).toBe('newest');
    expect(sortDrafts(drafts, undefined).map((d) => d.id)).toEqual(['d2', 'd1', 'd3']);
  });

  it('sorts oldest, platform, status', () => {
    expect(sortDrafts(drafts, 'oldest').map((d) => d.id)).toEqual(['d3', 'd1', 'd2']);
    expect(sortDrafts(drafts, 'platform').map((d) => d.id)).toEqual(['d2', 'd3', 'd1']);
    expect(sortDrafts(drafts, 'status').map((d) => d.id)).toEqual(['d1', 'd3', 'd2']);
  });

  it('paginates 5 per page and clamps out-of-range page', () => {
    expect(DRAFT_PAGE_SIZE).toBe(5);
    const big = Array.from({ length: 7 }, (_, i) => ({
      id: `x${i}`,
      platform_slug: 'threads',
      status: 'approved',
      created_at: `2026-09-0${(i % 9) + 1}T10:00:00Z`
    }));
    const p1 = paginateDrafts(big, 1);
    expect(p1.pageItems).toHaveLength(5);
    expect(p1.totalPages).toBe(2);
    const p2 = paginateDrafts(big, 2);
    expect(p2.pageItems).toHaveLength(2);
    const clamped = paginateDrafts(big, 99);
    expect(clamped.page).toBe(2);
    expect(paginateDrafts([], 1).totalPages).toBe(1);
  });
});
