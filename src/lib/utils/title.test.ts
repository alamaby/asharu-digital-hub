import { describe, expect, it } from 'vitest';
import { pageHeading } from './title';

describe('pageHeading', () => {
  it('strips the brand suffix from meta titles', () => {
    expect(pageHeading('Produk Afiliasi Pilihan | Asharu')).toBe(
      'Produk Afiliasi Pilihan'
    );
    expect(pageHeading('About Asharu | Asharu')).toBe('About Asharu');
  });

  it('leaves titles without the suffix untouched', () => {
    expect(pageHeading('Asharu')).toBe('Asharu');
  });
});
