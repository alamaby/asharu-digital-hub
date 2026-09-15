# Affiliate: Migrasi Dual-Write (file) → DB-Only + Hapus Race Workflow

Task: menghentikan dual-write katalog afiliasi (`src/data/affiliate-products.ts` +
256 `.webp` lokal + tabel `affiliate_products`) agar scraper hanya menulis
Supabase (Postgres + Storage `affiliate-images`), halaman publik membaca DB via
anonClient dengan ISR 3600, dan step `git commit/push` di workflow dihapus —
menghilangkan kelas kegagalan `rejected (fetch first)` 2026-09-14.

## Keputusan Desain

- `featured` → kolom boolean `is_featured` (backfill 6 pertama = ASH-232..237).
- Gambar → upload WebP ke bucket public `affiliate-images` (skip-if-exists,
  idempotent); path lama `/images/...` dihapus saat M4.
- Freshness → `export const revalidate = 3600` (pola Artikel).
- ID publik/tracking → `friendly_code` (`ASH-XXX`).

## Perubahan (committed `0bd5768`, submodule `1eb2fea`)

- `supabase/migrations/20260915000001_affiliate_is_featured.sql` (+applied prod).
- `supabase/migrations/20260915000002_affiliate_storage_bucket.sql` (+applied prod).
- `next.config.ts` — `images.remotePatterns` Storage (CSP img-src sudah ok, tak berubah).
- `scripts/lib/storage-uploader.mjs` — upload WebP ke `affiliate-images`.
- `scripts/scrape-affiliate.mjs` — `uploadAffiliateImage` (bukan `downloadImage` lokal); payload upsert +`is_featured`; `COMPARE_KEYS` +`is_featured`; `concurrency.group`; fail-loud (no remote fallback).
- `.github/workflows/scrape-affiliate.yml` — checks DB; **step Commit dihapus**.
- `src/lib/affiliate/public.ts` — `anonClient`, `getActiveProducts`, `getFeaturedProductsDB(6)`, mapper DB→`AffiliateProduct`.
- `src/data/schemas.ts` — `image` union (lokal | Storage URL).
- `src/app/[locale]/(public)/{page,products/page.tsx}` — ISR 3600 + DB read.
- `src/data/data.integrity.test.ts` + `src/lib/seo/jsonld.test.ts` — fixture hermetik, tidak impor file.
- `README.md` — arsitektur + bagian scraper diupdate (DB-only, tidak ada commit otomatis).

## Verifikasi

- Gate M1–M3: typecheck ✓ lint ✓ build ✓; test 581/583 (1 flaky pre-existing
  `ContentRequestForm.test.tsx` timeout DB, tidak terkait, lolos isolasi).
- MCP prod: `is_featured` = 6 (ASH-232..237); bucket `affiliate-images` +
  policy SELECT anon/authenticated terpasang; `image` masih 239 lokal
  (`/images/…`) — belum ada URL Storage sampai scrape fresh berjalan.

## Risiko / Blokir

- **M4.1 scrape fresh BLOCKED di local:** `collshp.com` API 503 dari environment
  ini (ikut `--insecure`, tetap 503; infrastruktur eksternal). Scrape full +
  verifikasi SQL (`storage_img == active`, `featured == 6`, `broken == 0`)
  **harus via `workflow_dispatch` di CI.**
- **Transisi sedang berjalan:** kode M3 sudah tidak impor
  `src/data/affiliate-products.ts`, tapi kolom DB `image` masih path lokal.
  Hapus file/dir (`M4.2`) **tidak dilakukan** sampai setelah CI mengisi Storage,
  atau halaman publik broken image. `AffiliateProductSchema.image` union
  (lokal|Storage) menampung masa transisi ini.
- `item_id` tracking GA berubah `affiliate-<id>` → `ASH-XXX` (cutover tercatat).
- Git blob `.webp` lama (256 file / 11,7 MB) dibiarkan mengendap; rewrite
  histori diluar cakupan (lihat plan §Scope).
- `idx_affiliate_products_active_featured` muncul "unused" di advisors karena
  baru — expected, akan terpakai setelah push ke prod + first ISR read.

## Berkas Terkait

- Plan: `plans/2026-09-15-affiliate-db-only-migration-plan.md`
- RCA lama (referensi anti-polisi): `2026-09-14-riset-9a24c768-gambar-produk-404.md`.
