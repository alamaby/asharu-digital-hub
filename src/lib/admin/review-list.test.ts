import { describe, expect, it } from 'vitest';
import { paginateReview, parseMultiParam, serializeMultiParam } from './review-list';

describe('parseMultiParam', () => {
  const allowed = new Set(['needs_review', 'approved', 'rejected']);

  it('parses comma-separated values, dedupes, drops unknown', () => {
    expect(parseMultiParam('needs_review,approved', allowed)).toEqual(['needs_review', 'approved']);
    expect(parseMultiParam('approved,approved,bogus,all,', allowed)).toEqual(['approved']);
    expect(parseMultiParam(undefined, allowed)).toEqual([]);
    expect(parseMultiParam('all', allowed)).toEqual([]);
    expect(parseMultiParam('', allowed)).toEqual([]);
  });

  it('accepts readonly array as allowlist', () => {
    expect(parseMultiParam('b,a', ['a', 'b'])).toEqual(['b', 'a']);
  });
});

describe('serializeMultiParam', () => {
  it('joins or returns undefined when empty', () => {
    expect(serializeMultiParam(['a', 'b'])).toBe('a,b');
    expect(serializeMultiParam([])).toBeUndefined();
  });
});

describe('paginateReview', () => {
  it('slices and clamps', () => {
    const p = paginateReview([1, 2, 3], 2, 2);
    expect(p.pageItems).toEqual([3]);
    expect(p.totalPages).toBe(2);
    expect(paginateReview([1], 99, 10).page).toBe(1);
    expect(paginateReview([], 1, 10).totalPages).toBe(1);
  });
});
