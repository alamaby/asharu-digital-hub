import { describe, expect, it } from 'vitest';
import {
  PRODUK_PAGE_SIZE,
  parseProdukFilter,
  clampPage,
  pageRange,
  escapeIlike,
  buildSearchOr
} from './produk-query';

describe('PRODUK_PAGE_SIZE', () => {
  it('equals 20', () => {
    expect(PRODUK_PAGE_SIZE).toBe(20);
  });
});

describe('parseProdukFilter', () => {
  it('returns valid filters unchanged', () => {
    expect(parseProdukFilter('all')).toBe('all');
    expect(parseProdukFilter('pinned')).toBe('pinned');
    expect(parseProdukFilter('auto')).toBe('auto');
    expect(parseProdukFilter('excluded')).toBe('excluded');
  });

  it('returns "all" for any invalid/undefined/null/number', () => {
    expect(parseProdukFilter(undefined)).toBe('all');
    expect(parseProdukFilter(null)).toBe('all');
    expect(parseProdukFilter(42)).toBe('all');
    expect(parseProdukFilter('bogus')).toBe('all');
    expect(parseProdukFilter('PINNED')).toBe('all');
    expect(parseProdukFilter('all ')).toBe('all');
  });
});

describe('clampPage', () => {
  it('returns 1 for non-string inputs when totalPages > 0', () => {
    expect(clampPage(undefined, 5)).toBe(1);
    expect(clampPage(null, 5)).toBe(1);
    expect(clampPage(42, 5)).toBe(1);
  });

  it('clamps NaN / negative / zero to 1', () => {
    expect(clampPage('abc', 5)).toBe(1);
    expect(clampPage('-3', 5)).toBe(1);
    expect(clampPage('0', 5)).toBe(1);
  });

  it('caps at totalPages when > total', () => {
    expect(clampPage('99', 5)).toBe(5);
    expect(clampPage('3', 2)).toBe(2);
  });

  it('returns 1 when totalPages is 0 (no data)', () => {
    expect(clampPage(undefined, 0)).toBe(1);
    expect(clampPage('1', 0)).toBe(1);
    expect(clampPage('5', 0)).toBe(1);
  });
});

describe('pageRange', () => {
  it('returns 0-19 for page 1', () => {
    expect(pageRange(1)).toEqual({ from: 0, to: 19 });
  });

  it('returns 40-59 for page 3', () => {
    expect(pageRange(3)).toEqual({ from: 40, to: 59 });
  });

  it('uses custom pageSize', () => {
    expect(pageRange(1, 10)).toEqual({ from: 0, to: 9 });
    expect(pageRange(2, 10)).toEqual({ from: 10, to: 19 });
  });
});

describe('escapeIlike', () => {
  it('escapes backslash, percent, and comma independently', () => {
    // Each special char doubled; others untouched.
    expect(escapeIlike('a\\b')).toBe('a\\\\b');
    expect(escapeIlike('100%')).toBe('100\\%');
    expect(escapeIlike('a,b')).toBe('a\\,b');
  });

  it('escapes all special chars together (only \\ % , are transformed)', () => {
    // Input '100%, a_b\\d' has len 12 (two literal backslashes before d).
    // Each \→\\, %→\%, ,→\, adds 1 char each: 12+2+1+1 = 16? No — two \s → +2 = 14, then +1+%,+ = 16.
    // Actually each replacement doubles matched chars: 2 bs→4 (+2), 1 %→2 (+1), 1 ,→2 (+1) = 12+4 = 16.
    // Verifikasi dengan assert substring, jangan hardcode length yang rentan off-by-one.
    const input = '100%, a_b\\d';
    const result = escapeIlike(input);
    expect(result).toContain('100\\%');
    expect(result).toContain('\\,');
    expect(result).toContain('a_b\\\\d'); // original 2 bs doubled to 4
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeIlike('hello')).toBe('hello');
    expect(escapeIlike('')).toBe('');
  });
});

describe('buildSearchOr', () => {
  it('returns null for empty/whitespace input', () => {
    expect(buildSearchOr('')).toBeNull();
    expect(buildSearchOr('   ')).toBeNull();
  });

  it('builds three-field or condition with escapes', () => {
    const result = buildSearchOr('shopee');
    expect(result).toBe('name_id.ilike.%shopee%,friendly_code.ilike.%shopee%,merchant.ilike.%shopee%');
  });

  it('escapes comma so PostgREST .or() does not split into extra conditions', () => {
    // Without escaping, comma would be interpreted as OR separator by PostgREST.
    const result = buildSearchOr('a,b');
    // Should have exactly 3 ilike clauses (one per field), not 6.
    const nonNull = result!;
    const ilikeCount = (nonNull.match(/ilike/g) ?? []).length;
    expect(ilikeCount).toBe(3);
    // Comma must be escaped: the search term 'a,b' should appear as 'a\\,b'.
    expect(result).toContain('a\\,b');
  });

  it('escapes percent sign so it is literal', () => {
    const result = buildSearchOr('100%');
    expect(result).toContain('100\\%');
  });

  it('escapes backslash twice (literal backslash di ILIKE)', () => {
    // Input 'a\\b' is 4 chars (a + 2 bs + b); each bs doubled → 6 chars.
    const result = buildSearchOr('a\\b');
    expect(result).toContain('a\\\\b');
  });
});
