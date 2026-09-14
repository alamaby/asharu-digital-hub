# Riset 9a24c768 — Gambar Produk Tetap 404 (Drift DB↔Repo)

Created: 2026-09-14 10:00:00

## Objective
Gambar ASH-232..ASH-243 (termasuk ASH-242/243 riset `9a24c768`) tampil kembali,
dan gate CI scrape tidak lagi gagal sehingga drift DB↔repo tidak terulang.

## Scope
- Fix test fixture agar independen dataset scrape.
- Normalisasi whitespace nama produk di writer scraper.
- Re-scrape via `workflow_dispatch` untuk memulihkan 12 gambar + regenerasi file data.
- Guard CI: verifikasi file gambar ada sebelum commit.
- Fallback UI di `FixedProductCard` (onError → placeholder).

## Milestones
1. Fix gate test + normalisasi nama
2. Re-scrape & pulihkan 12 gambar (repo + DB sinkron)
3. Hardening guard CI + fallback UI

## Tasks
- [x] `src/components/cards/ProductCarousel.test.tsx`: ganti fixture dataset → array lokal 3 produk
- [x] `src/components/cards/ProductCard.test.tsx`: ganti `affiliateProducts[0]` → fixture lokal
- [x] Audit `jsonld.test.ts` (import dataset) — assertion self-referential (kedua sisi dari dataset yang sama), tidak sensitif isi → tanpa perubahan
- [x] `scripts/lib/data-writer.mjs`: normalisasi `\s+`→spasi tunggal + trim di `toAffiliateProduct`
- [x] Gate: `npm run typecheck` + `npm run lint` + `npm test` hijau (556/556)
- [x] Commit + push phase 1 (`db0de1b`)
- [x] Re-scrape via `gh workflow run scrape-affiliate.yml` → 12 .webp ada, file data 239 produk (run 34806558884 hijau, commit CI `e9cd7d0`)
- [x] Verifikasi: 12 file ada di disk + `data.integrity.test.ts` hijau di CI + cek file ASH-242/243
- [x] Commit + push phase 2 (gambar + file data — dilakukan CI `e9cd7d0`, di-pull lokal)
- [x] `.github/workflows/scrape-affiliate.yml`: cek setiap path `/images/` di file ada di disk sebelum commit
- [x] `FixedProductCard`: fallback `onError` ke placeholder SVG + test
- [x] Verifikasi browser: halaman riset 9a24c768 menampilkan gambar ASH-242/243 (capture `riset-9a24c768-gambar-fixed`); URL gambar 200 di prod
- [x] Update `.memory/` + tutup plan

## Risks
- Re-scrape hari sepi bisa mengurangi produk → guard mass-deactivation 20% sudah ada; periksa diff sebelum push.
- Hash gambar bisa berubah bila foto upstream berubah → DB ikut di-upsert oleh scrape (by design).
- MITM lokal → fallback lokal pakai `node --env-file=.env.local scripts/scrape-affiliate.mjs --insecure`.
- Fallback ke URL remote bisa lolos tanpa terdeteksi → ditutup guard CI baru.

## Progress Log
- 2026-09-14 10:00 — Plan dibuat; eksekusi dimulai (keputusan user: re-scrape via workflow_dispatch, fallback placeholder ikut).
- 2026-09-14 11:22 — Fase 1 selesai: fixture lokal (ProductCarousel/ProductCard), normalisasi whitespace writer, fallback onError FixedProductCard + test, guard aset workflow, `.gitignore` `.openchamber`; gate 556 tests hijau; pushed `db0de1b`.
- 2026-09-14 11:35 — Fase 2: `gh workflow run scrape-affiliate.yml` (run 34806558884) hijau semua step; commit CI `e9cd7d0` = 12 .webp + file data 239 produk; di-pull lokal. DB terkonfirmasi nama ternormalisasi (tanpa spasi ganda).
- 2026-09-14 11:55 — Verifikasi produksi: kedua URL gambar 200; capture browser halaman riset menampilkan kedua gambar produk. Selesai.

## Notes
- Non-telecom bugfix → TOGAF proporsional (AGENTS.md §3). Tanpa migrasi DB (hanya upsert scrape, non-destruktif).
- RCA: scrape 2026-09-12 (run 34681699238) sukses download 12 gambar + upsert DB, tapi gagal gate `npm test` (`ProductCarousel.test.tsx` fixture `slice(0,3)` vs nama ber-spasi ganda) → step commit tak jalan → 12 `.webp` 404 di deploy. Run 2026-09-13 gagal sama.
