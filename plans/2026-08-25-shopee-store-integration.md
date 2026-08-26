# Integrasi Toko Shopee — Poin 3 Penggantian Placeholder

Created: 2026-08-25 10:20:00

## Objective
Mengganti entri placeholder Shopee dengan data toko riil (`shopee.co.id/shop/9268731`), mendukung atribusi afiliasi tanpa mengorbankan stabilitas URL, dan mempercantik kartu toko dengan aksen warna brand Shopee (#EE4D2D) — patuh brand guidelines hasil riset publik.

## Scope
- Skema data: field opsional `affiliateUrl` + `handle` pada `shopLinkSchema`
- Data: entri Shopee kanonis + link afiliasi terlacak sebagai fallback-able
- Komponen: `ShopCard` (href fallback, rel sponsored kondisional, aksen brand, baris handle, aria-label unik)
- Test: integritas data + unit `ShopCard`
- Docs: README (semantik afiliasi, self-referral warning)

## Milestones
1. Skema & data
2. Komponen ShopCard
3. Test
4. Docs + gates + commit

## Tasks
- [x] `shopLinkSchema`: tambah opsional `affiliateUrl`, `handle`
- [x] `shop-links.ts`: Shopee → `url` kanonis `https://shopee.co.id/shop/9268731`, `affiliateUrl: https://id.shp.ee/u1L2EQuP` (+ komentar refresh), deskripsi dipoles
- [x] `ShopCard`: href `affiliateUrl ?? url`; `rel="sponsored nofollow"` hanya saat afiliasi; aksen chip #EE4D2D utk platform shopee; baris `@handle` bila ada; `aria-label="Kunjungi Toko {nama}"`
- [x] Integrity test: kanonis + affiliate https valid, URL toko unik
- [x] Test baru `ShopCard`: sponsored muncul/tidak, href benar, accessible name
- [x] README: bagian "Toko & link afiliasi"
- [x] Gates hijau: lint / typecheck / test / build

## Risks
- Short-link `shp.ee` dapat kedaluwarsa → mitigasi: fallback otomatis ke URL kanonis; komentar refresh di data
- Komisi afiliasi tidak berlaku untuk pembelian sendiri (self-referral dilarang program) → didokumentasikan di README
- Kontras dekoratif oranye #EE4D2D bukan satu-satunya pembeda — identifikasi tetap lewat teks nama + glyph tas putih (color-blind-safe)

## Progress Log
- 2026-08-25 10:20 — Plan disetujui user ("tulis plan, lanjut implement"); keputusan terkunci: URL kanonis + afiliasi tracking aktif + aksen warna brand.
- 2026-08-25 10:45 — Implementasi selesai. Skema +2 field opsional; entri Shopee kanonis `shopee.co.id/shop/9268731` + affiliateUrl `id.shp.ee/u1L2EQuP`; ShopCard fallback href + sponsored rel kondisional + chip #EE4D2D + handle opsional + aria-label unik per kartu; README §Toko & link afiliasi (self-referral warning). Gates: lint ✓ typecheck ✓ test **102/102** ✓ build 33 halaman ✓. Belum di-commit (menunggu instruksi user).
- 2026-08-25 11:30 — Follow-up: toko non-Shopee disembunyikan via field `hidden` baru pada schema (data scaffold tetap tersimpan) + helper `getVisibleShopLinks()`; homepage memakai helper; guard test "hanya Shopee yang publish". Gates: lint ✓ typecheck ✓ test **104/104** ✓ build ✓.

## Notes
- Riset: tidak ada embed/widget resmi Shopee untuk situs pihak ketiga; simbol/logo penuh berisiko trademark — dipilih aksen warna + teks.
- Handle vanity belum tersedia (ID internal 9268731); field disiapkan, diisi nanti bila user kirim username.
