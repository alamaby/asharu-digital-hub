import { describe, expect, it } from 'vitest';
import { mapCategory, type ProductCategory } from './category';

describe('mapCategory', () => {
  const cases: Array<[string, ProductCategory]> = [
    ['Wireless 2in1 Mouse Bluetooth USB', 'electronics'],
    ['Smartwatch Aktivitas Harian', 'electronics'],
    ['Lampu Meja LED Minimalis', 'home-living'],
    ['Rak Penyimpanan Serbaguna', 'home-living'],
    ['Tumbler stainless 1L', 'home-living'],
    ['Kemeja Katun Kasual Pria', 'fashion'],
    ['FUB Jaket Zipper Fleece Korean Style', 'fashion'],
    ['Sandal Slop Wanita Eva Soft', 'fashion'],
    ['Hijab anak murce', 'fashion'],
    ['Matras Yoga Anti-Selip', 'sports-hobby'],
    ['Mainan jadul 90an Tamagotchi', 'sports-hobby'],
    ['Perlengkapan Kemping', 'sports-hobby']
  ];

  it.each(cases)('maps %s to %s', (title, expected) => {
    expect(mapCategory(title)).toBe(expected);
  });

  it('falls back to fashion for unknown text', () => {
    expect(mapCategory('Produk misterius tanpa kategori jelas')).toBe('fashion');
  });

  it('returns fallback for empty text', () => {
    expect(mapCategory('')).toBe('fashion');
  });
});