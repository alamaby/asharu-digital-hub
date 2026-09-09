# Bing "Discovered but not crawled" + Maps Pin Kamarasan

Date: 2026-09-09 ~15:40 (local time)

## Task
User melampirkan screenshot Bing Webmaster: URL Kamarasan berstatus "Discovered but not crawled" (discovered 09 Sept 2026) + referensi Bing Webmaster Guidelines, serta memberi Maps URL owner: `https://maps.app.goo.gl/KG9sRSjGQaHvFL6f7`.

## Diagnosis Bing ( diverifikasi live )
- `robots.txt` live: `Allow: /` + sitemap terdaftar — TIDAK ada blokir.
- `sitemap.xml` live: URL Kamarasan ID+EN ada, `lastmod` per-properti, priority 0.9 — deploy SEO hyperlocal (`640b4d0`) sudah live.
- Halaman SSG (HTML mentah, cepat) — tidak ada masalah render JS/CSP untuk crawler.
- Kesimpulan: status Bing normal untuk situs baru/otoritas rendah — Bing tahu URL tapi belum alokasi crawl. Bukan penalti. Aksi user: klik **Request indexing** di panel itu, tunggu 3–14 hari, bangun inbound link (listing mirror). Tidak ada perbaikan kode yang dibutuhkan untuk ini.

## Key files changed (commit `53b8289`, merge `27e4983`, pushed)
- `src/data/properties.ts` — `mapsUrl` Kamarasan = short link owner (pin tepat, owner-verified).
- `src/app/[locale]/properties/[slug]/page.tsx` — section H2 `Lokasi di Peta`: iframe embed lazy (query `Kamarasan Residence, Buahbatu, Bojongsoang` — aproksimasi area) + link pin tepat via `mapsUrl`. Tombol Google Maps di CTA atas juga otomatis aktif.
- `src/messages/id.json` + `en.json` — `propertyPage.mapHeading` (paritas dijaga).
- `next.config.ts` — CSP tambah `frame-src 'self' https://www.google.com https://maps.google.com` (sempit, hanya untuk embed peta; `frame-ancestors 'none'` tetap).
- Counter-argument: embed menambah request pihak ketiga + CLS — mitigasi: `loading="lazy"`, tinggi fixed `h-80/sm:h-96`, di bawah fold.

## Verification
- `npm run typecheck` hijau, `npm run lint` hijau, `npm test` 324/324 hijau (41 files) — diulang pasca-merge.
- Secret scan diff bersih.
- Push sempat rejected (remote `dceab04 chore(data)` dari sesi lain) → `git fetch` + `git pull --no-rebase` (merge bersih, hanya data afiliasi) → gate hijau → push sukses.

## Follow-up
- [USER] Klik Request indexing di Bing + pantau 3–14 hari; hal yang sama di GSC.
- Embed memakai query nama (bukan koordinat pin) — jika owner memberi lat/lng, ganti `src` iframe ke `q=lat,lng` agar presisi.
