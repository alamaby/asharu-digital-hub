# Affiliate: Dense Renumber + Burn-Stop for `friendly_code` (ASH-001..N)

Created: 2026-09-18 10:00 WIB

## Objective

Satu kali rapatkan ulang kode afiliasi agar nilai numerik = urutan produk saat ditambahkan, tanpa burn sequence:
- 240 aktif → `ASH-001..ASH-240`, produk terbaru = `ASH-240`.
- Produk baru selanjutnya alokasi `MAX+1` eksplisit (bukan `nextval` spekulatif).

## Scope

Masuk:
- Migrasi DB: renumber aktif `created_at ASC` jadi `ASH-001..N`; non-aktif pensiun ke range 9000+.
- Ganti generator dari `nextval()` ke `MAX+1` width-safe; drop sequence.
- Simpan pemetaan lama→baru di tabel `affiliate_friendly_remap`.
- Scraper: alokasi eksplisit per `external_id` baru, nol burn pada upsert.
- Backfill snapshot di `content_drafts` (injections, swap_history).
- Fallback UI review draf lama (friendly_code tidak ketemu → UUID lookup / url lookup).

Keluar:
- Ubah `product_id` UUID (tetap stabil).
- Rewrite teks log/bebas (histori GA, `content_research_logs.message`).
- Kompaksi berkala — tidak dilakukan (akan instabilkan ID).

## Progress Log

- 2026-09-18 10:45 — M1 selesai: audit DB prod (253 aktif, max=747, gap=746, featured=6). Plan dibuat.
- 2026-09-18 11:15 — M2 selesai: renumber ke ASH-001..ASH-253, gap=0; tabel `affiliate_friendly_remap` (253 baris) dibuat; trigger `trg_friendly` diganti, fungsi `gen_friendly_code()` pakai MAX+1; sequence lama di-drop. Migrasi file: `supabase/migrations/20260918000001_affiliate_friendly_code_dense_renumber.sql`.
- 2026-09-18 11:30 — M4 sebagian: 118 draft injection + 2 swap_history di-backfill; verifikasi validasi (0 referensi invalid). Fallback UI review sudah ada (lookup by UUID + URL).
- 2026-09-18 11:40 — M3 selesai: scraper kirim `friendly_code` eksplisit (existing tetap, baru = MAX+1); trigger tidak pernah bakar sequence. Gate typecheck ✓ lint ✓ test 816/816 ✓ build siap.
- 2026-09-18 11:50 — Menyiapkan commit & push.

## Notes

- Urutan densifikasi = `ORDER BY created_at, external_id ASC`. Tidak mengubah urutan featured (tetap 6 produk).
- Non-aktif tidak ada saat ini (0 rows), jadi range pensiun 9000+ belum terpakai — tetap ada di desain untuk defensif.
- Kode lama masih tersimpan di `affiliate_friendly_remap.old_code`; bisa dipakai rollback manual via `SELECT old_code FROM affiliate_friendly_remap ORDER BY row_number`.
- `product_id` UUID tetap stabil; tidak perlu backfill. Artikel published dan GA event tetap utuh.
