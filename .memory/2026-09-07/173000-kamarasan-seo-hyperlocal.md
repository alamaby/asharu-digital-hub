# SEO Hyperlocal Kamarasan — Bojongsoang/Gedebage/Ciwastra

Date: 2026-09-07 ~17:30 (local time)

## Task
Halaman `https://asharu.id/id/properti/dijual-rumah-kamarasan-bandung-timur` ditarget halaman 1 (ideal #1) untuk `rumah dijual gedebage`, `rumah dijual bojongsoang`, `dijual rumah ciwastra`, `rumah 3 kamar tidur Bandung` + kombinasi. User setuju: (1) ubah Title/H1, (2) tambah ~1000 kata + FAQ, (3) jarak ke Ciwastra = 3 menit (owner-verified).

## Key files changed
- `src/data/schemas.ts` — field opsional baru: `updatedAt` (YYYY-MM-DD), `locationGuide`, `buyingGuide` (keduanya `localizedText`). `description` tetap pendek untuk meta.
- `src/data/properties.ts` (Kamarasan saja) — title/desc SEO ID+EN, `location` → `Kamarasan, Bojongsoang — dekat Gedebage & Ciwastra`, alt galeri diperkaya variatif (5 foto hero ber-keyword, sisanya natural), `nearbyPlaces` + `Jl. Ciwastra 3 menit`, `locationGuide` + `buyingGuide` (±500 kata ID, EN natural), `faq` 10 item ID+EN (semua fakta terverifikasi owner), `updatedAt: 2026-09-08`.
- `src/app/[locale]/properties/[slug]/page.tsx` — label `Terakhir diperbarui`, section H2 `Lokasi & Akses Sekitar` (pre-gallery) + `Harga, KPR & Cara Survei` (pre-video). FAQ lama otomatis render + `FAQPage` schema (komponen sudah ada).
- `src/lib/seo/jsonld.ts` — `PostalAddress` lengkap (`streetAddress` dari `addressFull`, `addressLocality: Bojongsoang, Bandung Regency` khusus slug Kamarasan, `addressRegion: Jawa Barat`), tambah `numberOfRooms`, `floorSize` (MTK), `datePosted` dari `updatedAt`. Tanpa `geo` (koordinat belum terverifikasi — tidak dikarang).
- `src/app/sitemap.ts` — `lastModified` per properti dari `updatedAt`, prioritas 0.9 khusus slug Kamarasan (lainnya 0.7, home 1.0). Fix: kurung `flatMap` sempat kurang → typecheck merah → diperbaiki.
- `src/messages/id.json`, `src/messages/en.json` — `propertyPage.locationGuideHeading/buyingGuideHeading/updatedLabel`.

## Decisions
- Satu URL sebagai hub hyperlocal (bukan 4 halaman) — hindari kanibalisasi + thin content.
- Framing jujur: administratif Bojongsoang Kab. Bandung, `3 mnt Ciwastra / 14 mnt Tol Gedebage` sebagai kedekatan, bukan klaim `lokasi di Gedebage` (E-E-A-T).
- Rename file foto (`19.webp` dsb) TIDAK dilakukan — risiko break + cakupan besar; hanya alt yang dioptimasi. Follow-up opsional.
- `geo` tidak dikarang; embed Maps/`mapsUrl` Kamarasan belum ada (follow-up butuh link owner).

## Assumptions / risks
- Head term `rumah dijual gedebage` dikuasai aggregator DA tinggi (Rumah123/99.co/OLX) — target realistis: top-20 (30 hari) → halaman 1 long-tail (60–90 hari) → #1 query spesifik Kamarasan/Buahbatu.
- Halaman lebih panjang bisa menekan konversi — mitigasi: CTA WA di atas + `details` collapsed + buying guide dekat FAQ.
- EN keyword stuffing dihindari; EN ditulis natural.

## Verification
- `npm run typecheck` hijau (setelah fix `sitemap.ts`), `npm run lint` hijau, `npm test` 314/314 hijau (40 files).
- Secret scan diff: bersih (`sb_secret_`/`SUPABASE_*` nihil).
- Rich Results/GSC + submit sitemap = USER ACTION pasca-deploy (belum dilakukan).

## Commit
- `640b4d0 feat(seo): hyperlocal ranking for kamarasan bojongsoang gedebage ciwastra` (7 files, pushed `main`).
- `.memory/README.md` milik sesi agent lain tidak disentuh dalam commit ini.

## Follow-up (belum dikerjakan)
1. [USER] Deploy → GSC/Bing: request indexing URL + submit sitemap; pantau impresi 4 keyword cluster.
2. Google Business Profile + `mapsUrl` Kamarasan dari owner + NAP konsisten.
3. Listing mirror (OLX/FB/Mamikos) dengan link canonical ke asharu.id + 2–3 backlink hyperlocal.
4. Refresh `updatedAt` tiap 2–4 minggu untuk freshness signal.
