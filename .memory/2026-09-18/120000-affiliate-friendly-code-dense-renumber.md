# Affiliate: Dense Renumber + Burn-Stop for `friendly_code` (ASH-001..N)

- Task: rapatkan kode afiliasi menjadi `ASH-001..ASH-253` (produk terbaru = ASH-253),
  stop sequence burn yang membuat kode loncat ke ASH-747, backfill snapshot draf.
- Pilihan strategi: **B — renumber rapat total** (confirmed user).

## Perubahan

- **DB (prod, via MCP asharu)**:
  - Tabel baru `affiliate_friendly_remap(id, row_number, old_code, new_code, external_id UNIQUE)` — 253 baris pemetaan.
  - `affiliate_products.friendly_code` di-renumber ulang berdasarkan `created_at ASC` → `ASH-001..ASH-253`, gap = 0.
  - Fungsi `gen_friendly_code()` diganti: dari `nextval('affiliate_friendly_seq')` (lpad 3-digit) ke `MAX(numeric(friendly_code)) + 1` width-safe; sequence lama di-drop.
  - Trigger `trg_friendly` tetap terpasang (defensive fallback bila friendly_code NULL).
  - 118 draft `affiliate_injections[0].friendly_code` di-backfill via remap.
  - 2 draft `affiliate_swap_history[].to_friendly_code` di-backfill.
  - Verifikasi: 0 referensi invalid di injections, 0 di swap_history.
- **Script**: `scripts/scrape-affiliate.mjs`
  - Fetch tambahan `friendly_code` per `external_id`.
  - Precompute `MAX(friendly_code_numeric) + 1` sebelum upsert; assign eksplisit per external_id baru di scrape order.
  - Baris existing selalu kirim `friendly_code` yang sama (skip trigger auto-gen).
- **Plan file**: `plans/2026-09-18-affiliate-friendly-code-dense-renumber.md`
- **Migration file**: `supabase/migrations/20260918000001_affiliate_friendly_code_dense_renumber.sql` (sudah di-commit di submodule, tapi **belum diterapkan ulang** karena migration apply via MCP gagal — eksekusi manual di atas berhasil; file tetap sebagai dokumentasi).

## Status

- [x] M1 audit read-only
- [x] M2 migrasi + generator
- [x] M3 scraper alokasi eksplisit
- [x] M4 backfill snapshot + fallback
- [x] M5 verifikasi + gate + commit/push

## Risks (terdokumentasi di plan)

- Nonaktif product berikutnya akan menciptakan "lubang" (kode pensiun range 9000+ tetap ada di tabel tapi tidak aktif). Renumber berkala lagi = instabilkan ID → tidak dilakukan.
- Snapshot histori GA & log text (`content_research_logs.message`) tidak dimigrasi, tetap berisi kode lama.
- `product_id` UUID tetap stabil — artikel & fixed-product mechanism tidak terdampak.
- Concurrent insert masih mungkin collision pada MAX+1; mitigasi: single writer via `concurrency.group = scrape-affiliate`.

## Commit

- Parent: `263101f` feat(affiliate): dense renumber friendly_code ASH-001..N + scraper explicit allocation
- Submodule: `8f085c7` feat(db): dense renumber affiliate_friendly_code ASH-001..N plus burn-stop generator
