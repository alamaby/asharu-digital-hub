# Homepage Section Reorder

- **Tugas:** Susun ulang urutan section beranda: Produk Afiliasi Pilihan → Properti → Toko Online → Media Sosial → Belajar Matematika Kelas 2 SD.
- **File diubah:** `src/app/[locale]/page.tsx` — blok `#affiliate-products` + `#properties` dipindah ke atas (sebelum `#online-stores` + `#social-media`); hero CTA primer `#online-stores` → `#affiliate-products`; komentar urutan B–G dinomori ulang.
- **Tidak diubah (sengaja):** i18n messages, nav anchor, analytics `link_position`, ID section, meta SEO. Tentang + Kontak tetap paling bawah.
- **Keputusan:** Meta title/deskripsi dibiarkan (sentuh SEO); CTA hero ikut section konten pertama.
- **Asumsi/risiko:** Pengunjung lama perlu scroll lebih jauh ke Toko (mitigasi: nav anchor tetap); carousel+properti naik → beban awal bertambah, cek Lighthouse pasca-deploy.
- **Blocker:** QA manual belum (cek urutan `/id`+`/en`, scroll CTA, anchor lama).
- **Verifikasi:** `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (308 tests, 40 files).
- **Commit yang diusulkan:** `feat(home): reorder sections affiliate first`
- **Plan terkait:** `plans/2026-09-07-homepage-section-reorder.md`
