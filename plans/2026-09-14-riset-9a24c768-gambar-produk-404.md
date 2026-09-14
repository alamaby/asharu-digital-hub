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
- [ ] `src/components/cards/ProductCarousel.test.tsx`: ganti fixture dataset → array lokal 3 produk
- [ ] `src/components/cards/ProductCard.test.tsx`: ganti `affiliateProducts[0]` → fixture lokal
- [ ] Audit `jsonld.test.ts` (import dataset) — fixture bila assertion sensitif isi
- [ ] `scripts/lib/data-writer.mjs`: normalisasi `\s+`→spasi tunggal + trim di `toAffiliateProduct`
- [ ] Gate: `npm run typecheck` + `npm run lint` + `npm test` hijau
- [ ] Commit + push phase 1
- [ ] Re-scrape via `gh workflow run scrape-affiliate.yml` → 12 .webp ada, file data 239 produk
- [ ] Verifikasi: `data.integrity.test.ts` hijau + cek file ASH-242/243
- [ ] Commit + push phase 2 (gambar + file data)
- [ ] `.github/workflows/scrape-affiliate.yml`: cek setiap path `/images/` di file ada di disk sebelum commit
- [ ] `FixedProductCard`: fallback `onError` ke placeholder SVG + test
- [ ] Verifikasi browser: halaman riset 9a24c768 + 1 draf review menampilkan gambar
- [ ] Update `.memory/` + tutup plan

## Risks
- Re-scrape hari sepi bisa mengurangi produk → guard mass-deactivation 20% sudah ada; periksa diff sebelum push.
- Hash gambar bisa berubah bila foto upstream berubah → DB ikut di-upsert oleh scrape (by design).
- MITM lokal → fallback lokal pakai `node --env-file=.env.local scripts/scrape-affiliate.mjs --insecure`.
- Fallback ke URL remote bisa lolos tanpa terdeteksi → ditutup guard CI baru.

## Progress Log
- 2026-09-14 10:00 — Plan dibuat; eksekusi dimulai (keputusan user: re-scrape via workflow_dispatch, fallback placeholder ikut).

## Notes
- Non-telecom bugfix → TOGAF proporsional (AGENTS.md §3). Tanpa migrasi DB (hanya upsert scrape, non-destruktif).
- RCA: scrape 2026-09-12 (run 34681699238) sukses download 12 gambar + upsert DB, tapi gagal gate `npm test` (`ProductCarousel.test.tsx` fixture `slice(0,3)` vs nama ber-spasi ganda) → step commit tak jalan → 12 `.webp` 404 di deploy. Run 2026-09-13 gagal sama.
