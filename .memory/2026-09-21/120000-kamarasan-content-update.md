# Kamarasan content update — chip lokasi, emoji keunggulan, bullet guide, nearby 17

- Scope: halaman `properti/dijual-rumah-kamarasan-bandung-timur` (ID+EN)
- 5 permintaan user (chip lokasi, wording, emoji+keunggulan baru, bullet, nearby update): **done**
- Gate: typecheck ✓ lint ✓ test 976/976 ✓ build 83 halaman ✓
- Commit: `f56af02 feat(properti): kamarasan chip lokasi, emoji keunggulan, bullet guide, nearby 17, hapus PBG`
- File tersentuh:
  - `src/data/schemas.ts` — field aditif: `highlights.emoji`, `locationGuidePoints`, `buyingGuidePoints`
  - `src/data/properties.ts` — 10 highlights + emoji, 4+5 bullet points, nearby 11→17, update RS Edelweiss + Stasiun Kereta Gedebage, hapus PBG di Dokumen/faq/buyingGuide, bump updatedAt `2026-09-21`
  - `src/components/cards/PropertyCard.tsx` — chip bordered untuk lokasi
  - `src/app/[locale]/(public)/properties/[slug]/page.tsx` — chip lokasi hero, render emoji highlights, render `*Points` `<ul>` setelah paragraf intro
- Notes: skema non-destruktif (field opsional); bullet model "intro tetap + `<ul>`" agar SEO paragraph tetap utuh; klaim bata 2 lapis + full bata merah = owner-claimed
