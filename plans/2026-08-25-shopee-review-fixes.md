# Shopee Review Fixes — Identitas Riil & A11y Link

Created: 2026-08-25 10:55:00

## Objective
Menutup temuan review integrasi Shopee: mengganti identitas toko placeholder dengan nama riil "Asharu x Nopi.NY" (konfirmasi owner), menghapus klaim tak terverifikasi, dan memperbaiki accessible name link yang menimpa suffix tab-baru.

## Scope
- Data: `name` riil (sama id/en — proper noun), deskripsi dilunakkan, komentar marker dirapikan
- Komponen: hapus `aria-label` override; sr-only nama di dalam link
- Test: guard identitas + penyesuaian assertion accessible name

## Milestones
1. Data & komentar
2. ShopCard a11y
3. Tests
4. Gates + commit proposal + memory

## Tasks
- [x] `shop-links.ts`: name = "Asharu x Nopi.NY" (id=en); deskripsi tanpa klaim kelengkapan; konsolidasi komentar (verified by owner 2026-08-25)
- [x] `ShopCard.tsx`: hapus `aria-label`; tambah `<span class="sr-only">{nama}</span>` dalam link setelah CTA text
- [x] `data.integrity.test.ts`: +1 assertion identitas nama
- [x] `ShopCard.test.tsx`: expectation accessible name baru ("Kunjungi Toko Asharu x Nopi.NY (membuka di tab baru)")
- [x] Gates hijau: lint / typecheck / test / build

## Risks
- Accessible-name concatenation bergantung urutan DOM — diverifikasi via test role name regex.
- Insiden eksekusi: plan sempat tertulis salah ke `shop-links.ts` (langsung dipulihkan; diverifikasi via test integritas + git diff).

## Progress Log
- 2026-08-25 10:55 — Disetujui user ("lanjut"); mulai eksekusi.
- 2026-08-25 11:10 — Selesai. Identitas toko = "Asharu x Nopi.NY" (id=en); deskripsi tanpa klaim; komentar konsolidasi. ShopCard: aria-label override dihapus → accessible name alami "Kunjungi Toko Asharu x Nopi.NY (membuka di tab baru)" (suffix tab-baru kembali terbaca SR). Insiden: plan sempat salah-tulis ke shop-links.ts — dipulihkan penuh, diverifikasi git diff + test integritas. Gates: lint ✓ typecheck ✓ test **103/103** ✓ build 33 halaman ✓. Belum di-commit.

## Notes
- Handle vanity tetap kosong (belum diberikan user; field siap).
