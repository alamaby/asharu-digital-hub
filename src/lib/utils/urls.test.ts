import { describe, expect, it } from 'vitest';
import { extractUrls, isAllowedFetchUrl } from './urls';

describe('extractUrls', () => {
  it('extracts https URLs from free text', () => {
    const out = extractUrls('baca ini https://example.com/artikel-menarik ya');
    expect(out).toEqual(['https://example.com/artikel-menarik']);
  });

  it('trims trailing punctuation', () => {
    const out = extractUrls('cek https://example.com/a, dan https://example.com/b.');
    expect(out).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('dedupes repeat URLs', () => {
    const out = extractUrls('https://example.com/a https://example.com/a');
    expect(out).toHaveLength(1);
  });

  it('skips blocked hosts (SSRF guard)', () => {
    expect(extractUrls('http://localhost:3000/admin')).toEqual([]);
    expect(extractUrls('http://127.0.0.1/x')).toEqual([]);
    expect(extractUrls('http://169.254.169.254/meta')).toEqual([]);
  });

  it('returns empty for text without URLs', () => {
    expect(extractUrls('rekomendasi gadget meja kerja aesthetic')).toEqual([]);
  });
});

describe('isAllowedFetchUrl', () => {
  it('allows public https URLs', () => {
    expect(isAllowedFetchUrl('https://example.com/a')).toBe(true);
  });

  it('rejects non-http protocols', () => {
    expect(isAllowedFetchUrl('ftp://example.com/a')).toBe(false);
    expect(isAllowedFetchUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects localhost and private IPs', () => {
    expect(isAllowedFetchUrl('http://localhost/x')).toBe(false);
    expect(isAllowedFetchUrl('http://192.168.1.1/x')).toBe(false);
    expect(isAllowedFetchUrl('http://10.0.0.5/x')).toBe(false);
  });

  it('rejects URLs with credentials', () => {
    expect(isAllowedFetchUrl('https://user:pass@example.com/')).toBe(false);
  });
});
