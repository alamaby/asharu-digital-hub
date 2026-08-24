import { describe, expect, it } from 'vitest';
import { assertSafeExternalUrl, isSafeExternalUrl } from './safe-url';

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
