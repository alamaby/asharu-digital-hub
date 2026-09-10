import { describe, expect, it } from 'vitest';
import {
  compareKontenItems,
  normalizeKontenSort,
  paginateKonten,
  parsePlatformParam,
  sortKontenItems,
  type KontenItem
} from './konten-list';

const items: KontenItem[] = [
  { kind: 'request', id: 'r1', topic: 'tips anak banyak makan', platform: 'facebook', status: 'processing', category: null, provider: null, model: null, createdAt: '2026-08-31T12:54:00Z', attempts: 0 },
  { kind: 'draft', id: 'd1', topic: 'tips keyboard mekanik', platform: 'threads', status: 'failed', category: 'elektronik', provider: 'gemini', model: 'gemini-3.5-flash-lite', createdAt: '2026-09-09T17:02:00Z', attempts: null },
  { kind: 'draft', id: 'd2', topic: null, platform: null, status: 'needs_review', category: null, provider: 'cloudflare', model: '@cf/aisingapore/gemma-sea-lion-v4-27b-it', createdAt: '2026-09-08T11:42:00Z', attempts: null }
];

describe('normalizeKontenSort', () => {
  it('defaults to created desc', () => {
    expect(normalizeKontenSort(undefined, undefined)).toEqual({ sort: 'created', dir: 'desc' });
    expect(normalizeKontenSort('bogus', undefined)).toEqual({ sort: 'created', dir: 'desc' });
  });

  it('maps legacy newest|oldest params', () => {
    expect(normalizeKontenSort('newest', undefined)).toEqual({ sort: 'created', dir: 'desc' });
    expect(normalizeKontenSort('oldest', undefined)).toEqual({ sort: 'created', dir: 'asc' });
  });

  it('defaults non-date columns to asc', () => {
    expect(normalizeKontenSort('topic', undefined)).toEqual({ sort: 'topic', dir: 'asc' });
    expect(normalizeKontenSort('topic', 'desc')).toEqual({ sort: 'topic', dir: 'desc' });
  });
});

describe('parsePlatformParam', () => {
  const allowed = ['threads', 'facebook', 'twitter'];

  it('parses comma-separated slugs, dedupes, drops unknown', () => {
    expect(parsePlatformParam('threads,facebook', allowed)).toEqual(['threads', 'facebook']);
    expect(parsePlatformParam('threads,threads,bogus,all,', allowed)).toEqual(['threads']);
    expect(parsePlatformParam(undefined, allowed)).toEqual([]);
    expect(parsePlatformParam('all', allowed)).toEqual([]);
  });
});

describe('sortKontenItems', () => {
  it('sorts newest first by default so Sep rows precede Aug rows', () => {
    const ids = sortKontenItems(items, 'created', 'desc').map((i) => i.id);
    expect(ids).toEqual(['d1', 'd2', 'r1']);
  });

  it('sorts oldest first ascending', () => {
    const ids = sortKontenItems(items, 'created', 'asc').map((i) => i.id);
    expect(ids).toEqual(['r1', 'd2', 'd1']);
  });

  it('sorts by topic with nulls first ascending', () => {
    const ids = sortKontenItems(items, 'topic', 'asc').map((i) => i.id);
    expect(ids[0]).toBe('d2');
  });

  it('sorts by provider including model text', () => {
    const ids = sortKontenItems(items, 'provider', 'asc').map((i) => i.id);
    expect(ids[0]).toBe('r1');
    expect(ids.slice(1)).toEqual(['d2', 'd1']);
  });

  it('is stable on ties via createdAt then id', () => {
    const tied: KontenItem[] = [
      { kind: 'draft', id: 'b', topic: 'sama', platform: 'threads', status: 'needs_review', category: null, provider: null, model: null, createdAt: '2026-09-09T10:00:00Z', attempts: null },
      { kind: 'draft', id: 'a', topic: 'sama', platform: 'threads', status: 'needs_review', category: null, provider: null, model: null, createdAt: '2026-09-09T10:00:00Z', attempts: null }
    ];
    expect(sortKontenItems(tied, 'topic', 'asc').map((i) => i.id)).toEqual(['a', 'b']);
    const [first, second] = tied as [KontenItem, KontenItem];
    expect(compareKontenItems(first, second, 'topic', 'asc')).toBeGreaterThan(0);
  });
});

describe('paginateKonten', () => {
  it('slices pages and clamps out-of-range page', () => {
    const p1 = paginateKonten(items, 1, 2);
    expect(p1.pageItems).toHaveLength(2);
    expect(p1.totalPages).toBe(2);
    expect(p1.totalCount).toBe(3);
    const clamped = paginateKonten(items, 99, 2);
    expect(clamped.page).toBe(2);
    expect(clamped.pageItems).toHaveLength(1);
    expect(paginateKonten([], 1, 20).totalPages).toBe(1);
  });
});
