import { describe, expect, it } from 'vitest';
import { assertSafeExternalUrl, isSafeExternalUrl, safeInternalPath } from './safe-url';

describe('isSafeExternalUrl', () => {
  it.each(['https://shopee.co.id/asharu', 'mailto:a@b.id', 'tel:+62812'])(
    'allows %s',
    (value) => {
      expect(isSafeExternalUrl(value)).toBe(true);
    }
  );

  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://files.example.com',
    'not a url',
    '//example.com'
  ])('rejects %s', (value) => {
    expect(isSafeExternalUrl(value)).toBe(false);
  });
});

describe('assertSafeExternalUrl', () => {
  it('returns the value when safe', () => {
    expect(assertSafeExternalUrl('https://ok.example')).toBe('https://ok.example');
  });

  it('throws with context when unsafe', () => {
    expect(() => assertSafeExternalUrl('javascript:x()', 'shop link')).toThrow(
      /Unsafe shop link/
    );
  });
});

describe('safeInternalPath', () => {
  const FALLBACK = '/id/konten/review';

  it('mempertahankan path internal', () => {
    expect(safeInternalPath('/id/admin', FALLBACK)).toBe('/id/admin');
    expect(safeInternalPath('/en/content/review/abc', FALLBACK)).toBe('/en/content/review/abc');
  });

  it('fallback saat nilai kosong/null', () => {
    expect(safeInternalPath(null, FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath('', FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    'https://evil.example/phish',
    'http://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/id/admin\nSet-Cookie: x=1'
  ])('menolak %s (open redirect)', (value) => {
    expect(safeInternalPath(value, FALLBACK)).toBe(FALLBACK);
  });
});
