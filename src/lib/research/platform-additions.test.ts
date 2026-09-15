import { describe, expect, it } from 'vitest';
import {
  computeAddablePlatforms,
  isRealPlatformSlug,
  mergeSessionPlatforms,
  resolveEffectivePlatforms
} from './platform-additions';

const active = [
  { slug: 'artikel', display_name: 'Artikel' },
  { slug: 'facebook', display_name: 'Facebook' },
  { slug: 'threads', display_name: 'Threads' },
  { slug: 'twitter', display_name: 'Twitter' }
];

describe('platform-additions', () => {
  it('treats null/empty/all as non-real slugs', () => {
    expect(isRealPlatformSlug('threads')).toBe(true);
    expect(isRealPlatformSlug('all')).toBe(false);
    expect(isRealPlatformSlug('   ')).toBe(false);
    expect(isRealPlatformSlug(null)).toBe(false);
    expect(isRealPlatformSlug(undefined)).toBe(false);
  });

  it('resolves multi selection plus draft platforms, deduped and sorted', () => {
    const effective = resolveEffectivePlatforms(
      { platform_slug: null, platform_slugs: ['threads', 'twitter', 'threads'] },
      ['threads', 'facebook']
    );
    expect(effective).toEqual(['facebook', 'threads', 'twitter']);
  });

  it('resolves legacy single platform', () => {
    expect(resolveEffectivePlatforms({ platform_slug: 'threads' })).toEqual(['threads']);
  });

  it('ignores all/null drafts so agnostic sessions can add platforms', () => {
    expect(resolveEffectivePlatforms({ platform_slug: null, platform_slugs: [] }, ['all', null])).toEqual([]);
  });

  it('offers only active platforms not yet covered', () => {
    const addable = computeAddablePlatforms(['threads', 'twitter'], active);
    expect(addable.map((p) => p.slug)).toEqual(['artikel', 'facebook']);
  });

  it('excludes inactive and all-platform entries from candidates', () => {
    const withArchive = [
      { slug: 'all', display_name: 'Semua Platform (arsip)' },
      { slug: 'artikel', display_name: 'Artikel' }
    ];
    expect(computeAddablePlatforms([], withArchive).map((p) => p.slug)).toEqual(['artikel']);
  });

  it('merges additions, keeping single-platform column in sync', () => {
    expect(mergeSessionPlatforms(['threads'], ['artikel', 'twitter'])).toEqual({
      platform_slug: null,
      platform_slugs: ['artikel', 'threads', 'twitter']
    });
    expect(mergeSessionPlatforms([], ['artikel'])).toEqual({
      platform_slug: 'artikel',
      platform_slugs: ['artikel']
    });
  });

  it('drops duplicate and non-real additions when merging', () => {
    expect(mergeSessionPlatforms(['threads'], ['threads', 'all', ''])).toEqual({
      platform_slug: 'threads',
      platform_slugs: ['threads']
    });
  });
});
