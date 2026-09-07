# Homepage Section Reorder

Created: 2026-09-07 14:00:00

## Objective

Susun ulang urutan section halaman utama menjadi: Produk Afiliasi Pilihan → Properti Dijual & Disewakan → Toko Online → Media Sosial → Belajar Matematika Kelas 2 SD.

## Scope

- `src/app/[locale]/page.tsx` — reorder blok section + hero CTA primer
- Tidak menyentuh: i18n messages, navigasi, analytics `link_position`, ID section/anchor, meta SEO

## Milestones

1. Reorder section + CTA selesai
2. Gate hijau (typecheck, lint, test)

## Tasks

- [x] Pindahkan section `#affiliate-products` + `#properties` ke atas (sebelum `#online-stores` + `#social-media`)
- [x] Hero CTA primer `#online-stores` → `#affiliate-products`
- [x] Renumber komentar urutan B/C/D/E/F/G
- [x] Gate: `npm run typecheck`, `npm run lint`, `npm test`
- [ ] QA manual: urutan 5 section di `/id` + `/en`, scroll CTA, anchor lama `/#online-stores`

## Risks

- Pengunjung lama yang terbiasa cari Toko di atas harus scroll lebih jauh — mitigasi: nav anchor "Toko" tetap ada.
- Carousel afiliasi + gambar properti naik ke atas → beban awal bertambah; cek Lighthouse pasca-deploy.

## Progress Log

- 2026-09-07 14:00:00 — Reorder selesai di `src/app/[locale]/page.tsx`; menunggu gate.
- 2026-09-07 14:10:00 — Gate hijau: typecheck ✓, lint ✓, 308 tests (40 files) ✓.

## Notes

- Tentang + Kontak CTA tetap paling bawah (default, tanpa konfirmasi ulang di build mode).
- Meta title/deskripsi dibiarkan apa adanya (menyentuh SEO, tidak diubah tanpa permintaan eksplisit).
