# Perbaikan Urutan Katalog `/produk` + Purge ISR On-Demand

Created: 2026-09-16 08:55:00

## Objective

Memperbaiki halaman `/id/produk` yang menampilkan produk lama, padahal beranda sudah menampilkan produk baru — RCA: urutan `friendly_code ASC` + paginasi klien 8 item mengubur produk baru; plus tidak ada purge cache ISR saat scraper menulis DB.

## Scope

- `src/lib/affiliate/public.ts` — urutan dan select kolom
- `src/lib/affiliate/revalidate.ts` (baru) — helper purge cache
- `src/app/api/revalidate/products/route.ts` (baru) — endpoint purge
- `.github/workflows/scrape-affiliate.yml` — panggil purge pasca-sync
- Test: `public.test.ts`, `revalidate.test.ts` (baru)

## Milestones

1. Ubah urutan katalog + tambah `created_at` ke select
2. Tambah mekanisme purge cache ISR on-demand
3. Sambungkan workflow scrape
4. Gate hijau + commit/push

## Tasks

- [x] Ubah `getActiveProducts` → `is_featured DESC, created_at DESC`
- [x] Ubah `getFeaturedProductsDB` → `created_at DESC` (konsisten)
- [x] Tambah `created_at` ke `PRODUCT_SELECT` + tipe `AffiliateRow`
- [x] Buat `revalidateAffiliateCatalog()` (home + produk, kedua locale, bentuk publik + internal)
- [x] Buat endpoint `POST/GET /api/revalidate/products` (Bearer `CRON_SECRET`, fail-closed)
- [x] Tambah step purge best-effort di workflow scrape
- [x] Test unit: urutan query, mapping, fallback env, purge path
- [x] Verifikasi urutan terhadap DB produksi (read-only)
- [x] Gate: typecheck + lint + test + build
- [x] Commit + push

## Risks

- Urutan baru mengubah ekspektasi user yang terbiasa urut lama→baru (disetujui user: "Featured dulu").
- Endpoint purge butuh `CRON_SECRET` di GitHub Actions secrets; bila absen hanya warning (ISR 1 jam tetap berlaku).
- `revalidatePath` untuk route ber-rewrite middleware dipurge dalam dua bentuk (publik + internal) untuk menghindari miss — sedikit redundan tapi idempoten dan murah.

## Progress Log

- 2026-09-16 08:55:00 — RCA selesai. Akar masalah: `getActiveProducts()` mengurut `friendly_code ASC` tanpa limit, sementara `ProductBrowser` hanya merender 8 item pertama; produk baru (ASH-255) ada di posisi ~ke-240. Faktor sekunder: tidak ada `revalidatePath` on-demand (scraper menulis DB via service key). Dipilih strategi "Featured dulu" oleh user. Implementasi + endpoint purge + wiring workflow selesai.
- 2026-09-16 09:00:00 — Gate hijau: typecheck ✓, lint ✓, test 670/670 ✓, build ✓ (endpoint `/api/revalidate/products` terdaftar sebagai ƒ Dynamic). Verifikasi urutan query di DB produksi: ASH-255 (featured, terbaru) kini di posisi ke-1, diikuti ASH-232…236, lalu produk non-featured terbaru.

## Notes

- Referensi domain: RCA ini murni bug presentasi/katalog, bukan model domain rating/billing — Oracle C2M/TM Forum ODA tidak relevan di sini.
- Alternatif yang ditolak: (a) "Terbaru dulu" — menenggelamkan featured lama yang dikurasi; (b) sort control di UI — scope lebih besar untuk kebutuhan saat ini.
- Tie-breaker `created_at` (bukan `friendly_code DESC`) dipilih agar urutan tetap benar bila kode melewati 3 digit (`ASH-1000+`).
