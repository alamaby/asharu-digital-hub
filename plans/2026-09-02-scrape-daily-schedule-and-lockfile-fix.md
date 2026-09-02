# Scrape — Jadwal Harian & Sinkronisasi Lockfile

Created: 2026-09-02 15:00:00

## Objective
Pastikan workflow scrape `affiliate_products` sudah insert ke table, jadwal jadi harian 03:00 UTC, dan `npm ci` strict tidak gagal karena package-lock out of sync.

## Scope
- `.github/workflows/scrape-affiliate.yml` (jadwal)
- `package.json` / `package-lock.json` (sinkronisasi, strict `npm ci`)
- `README.md` + `plans/2026-08-27-affiliate-scraper-shopee-linktree.md` (sinkronisasi docs)
- Verifikasi insert DB

## Tasks
- [x] Verifikasi insert: `scripts/scrape-affiliate.mjs:156-186` upsert `affiliate_products` onConflict `external_id` + file `src/data/affiliate-products.ts`
- [x] Ubah jadwal `.github/workflows/scrape-affiliate.yml:6-7` dari `0 3 */4 * *` (4 hari) → `0 3 * * *` (harian 03:00 UTC, strict `npm ci`)
- [x] `npm install` sinkronisasi (audit 527 packages, `npm ci` lulus)
- [x] Sync docs: `README.md:151` + plan scraper scope/task
- [x] Gates: `npm run typecheck` ✓ `npm run lint` ✓

## Risks
- Harian vs 4-hari: lebih sering (image bandwidth Sharp WebP), tapi step commit hanya jika ada perubahan (`git status --porcelain`), jadi no-op jika katalog tidak berubah.
- `npm ci` strict fail-fast tetap: kontributor wajib `npm install` setelah ubah `package.json:17-45`.

## Progress Log
- 2026-09-02 15:00:00 — Jadwal harian 03:00 UTC, `npm install` sync, `npm ci` strict dipertahankan, docs sync.

## Notes
- Workflow insert ke `affiliate_products` (dual-write file+DB), bukan `content_drafts`.
- `package-lock.json` lockfileVersion 3, 679 packages, tracked.
