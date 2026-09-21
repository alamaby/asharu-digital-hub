# Plan: Update Konten Kamarasan (chip lokasi, wording, emoji keunggulan, bullet, nearby)

Created: 2026-09-21 10:30:00 WIB

## Objective

Update listing `dijual-rumah-kamarasan-bandung-timur` (ID + EN) sesuai 5 permintaan user dengan konfirmasi final.

## Scope

- Chip lokasi di card beranda dan hero detail page.
- Wording locationGuide ("daerah Gedebage/Ciwastra").
- Emoji tiap card Keunggulan + 2 keunggulan baru (bata 2 lapis, full bata merah).
- Bullet points untuk `Lokasi & Akses Sekitar` dan `Harga, KPR & Cara Survei` (intro tetap + `<ul>`).
- Hapus PBG dari semua penyebutan dokumen (extraSpecs, buyingGuide, FAQ).
- Nearby: update RS Edelweiss + Stasiun Kereta Gedebage, tambah 6 sekolah baru, re-sort naik waktu tempuh, bump `updatedAt`.

Out-of-scope: listing Buahbatu/Sukaraja, perubahan global CSS, perubahan struktur JSON-LD.

## Final Konfirmasi User

1. Emoji tabel disetujui (☀️ untuk bebas banjir).
2. Model: intro tetap + bullet. Dokumen: **hilangkan PBG**.
3. Ejaan sekolah persis seperti yang diajukan (MIN 2, Ashfiya, SMPN 51, SMAN 21, SD Islam Asy-Syifa 1, SDIT Bojongsoang Inspiratif).
4. Hero detail page ikut jadi chip lokasi (konsisten).

## Tasks

- [x] Chip lokasi card + hero detail
- [x] Wording locationGuide ID + EN
- [x] Skema highlights.emoji + render + 10 item ID/EN
- [x] Skema *Points + render <ul> + bullet ID/EN (dokumen tanpa PBG)
- [x] Hapus PBG di extraSpecs + buyingGuide + FAQ
- [x] Nearby: 2 update + 6 tambah + re-sort + bump updatedAt
- [ ] Test (integrity + render)
- [ ] Gate: typecheck + lint + test + build
- [ ] Commit-push Conventional Commits

## Progress Log

- 2026-09-21 10:30 — Plan dibuat berdasarkan investigasi read-only; menunggu user konfirmasi.
- 2026-09-21 10:35 — Konfirmasi user diterima; eksekusi dimulai di Build Mode.

## Notes

- Field aditif baru di skema (`highlights.emoji`, `locationGuidePoints`, `buyingGuidePoints`) — non-destruktif, optional.
- Klaim bata 2 lapis + full bata merah bersifat owner-claimed — tidak ada klaim teknis lain yang ditambah.
- File tersentuh: `src/data/properties.ts`, `src/data/schemas.ts`, `src/components/cards/PropertyCard.tsx`, `src/app/[locale]/(public)/properties/[slug]/page.tsx`, test terkait.
