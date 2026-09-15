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

## Insiden Lanjutan: `exists()` Bad Request (run CI pertama pasca-M2)

- **Gejala:** 240/240 `[warn] image upload failed: storage exists check failed:
  Bad Request` → exit 1. Upsert tetap jalan dengan fallback URL remote.
- **RCA (verified `storage-js@2.114.0/dist/index.mjs:1259`):** `exists()` pada
  objek hilang me-RESOLVE `{ data:false, error: 400 }` (bukan reject) —
  Supabase HEAD objek hilang = 400. Kode `if (existsErr) throw` menggagalkan
  semua upload karena bucket masih kosong.
- **Kerusakan:** kolom `image` 240 baris tertulis URL remote Shopee
  (MCP: `remote_other: 240`) — situs render tanpa remotePattern (broken)
  sampai run repair hijau.
- **Fix (`aff752e`):** hanya `data===true` = hit; fetch existing di depan loop
  untuk fallback gambar DB lama; produk BARU yang gagal dikecualikan dari
  upsert + gagalkan run (DB tak pernah simpan URL remote); asset-check
  workflow tolak non-Storage. Verifikasi infra prod one-off 6/6 PASS
  (exists-missing=false, upload, exists-present=true, public-url, remove,
  cleanup; bucket kembali 0 objek).
- **Repair:** `workflow_dispatch` run `34926314498` SUCCESS → MCP 240/240
  Storage, featured 6, broken 0, remote 0.

## Status Akhir (MIGRASI SELESAI)

- M4.2: file/dir obsolete dihapus; skema Storage-only; dry-run = JSON.
- M4.3: audit orphan 240/240/0 — tidak perlu GC.
- Gate final: typecheck ✓ lint ✓ test 583/583 ✓ build ✓ (`.next` clean sekali).
- Sisa catatan: `item_id` GA `affiliate-<id>` → `ASH-XXX` (cutover tercatat);
  blob `.webp` git lama mengendap (out-of-scope); index baru expected-unused
  sampai first ISR read prod.

## Berkas Terkait

- Plan: `plans/2026-09-15-affiliate-db-only-migration-plan.md`
- RCA lama (referensi anti-polisi): `2026-09-14-riset-9a24c768-gambar-produk-404.md`.
