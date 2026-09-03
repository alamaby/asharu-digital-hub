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
    ['Perlengkapan Kemping', 'sports-hobby'],
    // automotive — checked before electronics so a motorcycle phone holder
    // mentioning "Handphone" still lands on automotive.
    ['Polytron Fox 350 - Battery as Service - Electric Sepeda Motor Listrik - OTR Jadetabek - Banten', 'automotive'],
    ['RCCOR Motorcycle stand Holder Hp Motor Stand Penyangga Handphone Braket Spion', 'automotive'],
    ['APEN Tali Pengikat Helm Motor 2 Hook 60 CM Aksesoris Pengendara Motor Otomotif', 'automotive'],
    ['COVER JOK MOTOR CAFERACER (PAKAI TALI) BISA PASANG SENDIRI #NMAX#PCX #SCOOPY', 'automotive'],
    // keyword expansion — previously fell to the fashion fallback.
    ['Paddy Premium Case Design Aesthetic - Casing Custom Semua Tipe HP', 'electronics'],
    ['TIXX Mesin Kopi Espresso 20 Bar Mesin Kopi Rumahan Low Watt', 'home-living'],
    ['SUPRA Panci Wajan Penggorengan Stainless Steel SUS 304', 'home-living'],
    ['GRENEY-Gbras-Bra (2pcs) One Piece Warna Kombinasi', 'fashion'],
    ['Tsurayya - Part 2 (Abaya Saja) Abaya Namira Lengan Balon', 'fashion'],
    ['Homecart Kids Raincoat Bahan EVA Tebal Jas Hujan Anak', 'fashion'],
    ['THUMB GRIP ANALOG NINTENDO SWITCH OLED V2 V1 LITE', 'electronics'],
    ['Diecast Mobil Mitsubishi Pajero Miniatur Die-cast Mobil Mobilan Skala 1:64', 'sports-hobby']
  ];

  it.each(cases)('maps %s to %s', (title, expected) => {
    expect(mapCategory(title)).toBe(expected);
  });

  it('falls back to others for unknown text', () => {
    expect(mapCategory('Produk misterius tanpa kategori jelas')).toBe('others');
  });

  it('returns fallback for empty text', () => {
    expect(mapCategory('')).toBe('others');
  });
});