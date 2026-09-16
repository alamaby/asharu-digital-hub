# RCA + Fix: `/id/produk` Menampilkan Produk Lama (Urutan Katalog + Purge ISR)

Tanggal: 2026-09-16 (local time)
Topik: affiliate catalog ordering + on-demand ISR revalidation

## Masalah

Halaman `https://asharu.id/id/produk` masih menampilkan produk lama, padahal
section "featured" di beranda sudah menampilkan produk baru. Dilaporkan user dan
diminta analisa RCA.

## RCA

**Akar utama (bukan beda sumber data):** beranda dan `/produk` membaca tabel yang
sama (`public.affiliate_products`), tetapi:

- Beranda: `getFeaturedProductsDB(6)` → `is_active AND is_featured`, `ORDER BY
  friendly_code ASC`, `LIMIT 6` → 6 produk featured langsung tampil.
- `/produk`: `getActiveProducts()` → `is_active` saja, `ORDER BY friendly_code
  ASC`, **tanpa limit** → 240 baris, lalu `ProductBrowser` hanya merender
  `slice(0, 8)`.

Akibat: produk baru `ASH-255` (Oaktree Guqile X1, `is_featured=true`, 15 Sep)
berada di urutan ~ke-240, sehingga praktis tak terlihat (butuh klik "Muat 8 lagi"
~29x).

**Faktor sekunder:** tidak ada `revalidatePath` on-demand untuk halaman publik.
Scraper harian (`scripts/scrape-affiliate.mjs`) menulis DB langsung via service
key dari GitHub Actions — bukan Server Action — jadi `revalidate = 3600` untuk
`/produk` dan beranda bisa basi hingga 1 jam. Kali ini bukan penyebab utama
(beranda sudah fresh), tapi memperparah.

**Disimpulkan bukan penyebab:** RLS (`affiliate_read USING(true)` untuk anon),
filter locale (tidak ada di query), atau hardcode (file statis sudah dihapus).

Bukti DB produksi (read-only, 2026-09-16): 240 aktif, 6 featured; 8 item pertama
urutan lama = `ASH-001…008`; `ASH-255` posisi ke-240.

## Keputusan

User memilih strategi **"Featured dulu"**: `is_featured DESC, created_at DESC`.
Alternatif yang ditolak: "Terbaru dulu" (menenggelamkan featured kurasi) dan
sort control di UI (scope lebih besar).

## File yang Diubah

- `src/lib/affiliate/public.ts` — `getActiveProducts()` kini `is_featured DESC,
  created_at DESC`; `getFeaturedProductsDB()` pakai `created_at DESC`;
  `created_at` ditambah ke `PRODUCT_SELECT` + tipe `AffiliateRow`.
- `src/lib/affiliate/revalidate.ts` (baru) — `revalidateAffiliateCatalog()`
  memurge home + produk untuk kedua locale, dalam bentuk URL publik
  (`/id/produk`) sekaligus route internal ber-rewrite (`/id/products`).
- `src/app/api/revalidate/products/route.ts` (baru) — endpoint `POST`/`GET`
  Bearer-only `CRON_SECRET` (fail-closed via `isCronAuthorized`).
- `.github/workflows/scrape-affiliate.yml` — step purge cache best-effort
  (`continue-on-error`) setelah verifikasi DB; absen `CRON_SECRET` hanya warning.
- Test baru: `src/lib/affiliate/public.test.ts` (5), `src/lib/affiliate/revalidate.test.ts` (3).
- `plans/2026-09-16-produk-featured-order-isr.md` — plan file.

## Risiko / Catatan

- Urutan baru mengubah ekspektasi user lama; sudah disetujui eksplisit.
- Tie-breaker `created_at`, bukan `friendly_code DESC`, agar urutan aman saat kode
  melewati 3 digit (`ASH-1000+`).
- Endpoint purge butuh `CRON_SECRET` di GitHub Actions secrets (dan sudah ada di
  Vercel Production). Tanpa itu, ISR 1 jam tetap berlaku — degradasi, bukan break.
- [USER ACTION] Tambahkan `CRON_SECRET` ke GitHub Actions secrets (environment
  `Production`) agar purge otomatis aktif; jika tidak, cukup `workflow_dispatch`
  manual `/api/revalidate/products` pasca-scrape.

## Verifikasi

- Verifikasi query di DB produksi (read-only): `ASH-255` (featured, terbaru)
  kini posisi ke-1, diikuti `ASH-232…236`, lalu non-featured terbaru.
- Gate: `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 670/670 ✓,
  `npm run build` ✓ (endpoint `/api/revalidate/products` terdaftar ƒ Dynamic).

## Commit

`fix(affiliate): urutkan katalog produk featured dulu dan purge ISR on-demand`
