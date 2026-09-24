# 2026-09-24 — Lab Try: fix tabel hilang + metrik + riwayat filter

Tanggal: 2026-09-24 ~22:45 WIB
Topik: `/lab/try` — error `endpoint_try_runs` schema cache, metrik performance per uji ala Lab Chat, pagination/sorting/filter Riwayat Coba.

## Masalah
1. `/lab/try` tampil error mentah `Could not find the table 'public.endpoint_try_runs' in the schema cache`.
2. Setiap uji tidak menampilkan metrik performance selengkap Lab Chat (hasil hanya grid teks; uji List Model tidak tampil latensi sama sekali; path streaming selalu catat `latencyMs: 0`).
3. Riwayat Coba statis: selalu halaman 1, tanpa pagination/sorting/filter.

## Investigasi (via MCP supabase-asharu-be-production)
- `list_tables(public)`: 44 tabel, `endpoint_try_runs` TIDAK ada.
- `list_migrations`: remote berhenti di `20260922000003`; migrasi lokal `20260924000001_endpoint_try_runs.sql` belum applied.
- `is_admin()` ada di schema `public` → dependensi RLS aman.
- Security advisors: tidak ada temuan yang memblokir (hanya warning umum function search_path, anon SECURITY DEFINER, leaked-password protection).

## Keputusan & perubahan
- **DB (prod, via MCP `apply_migration`, non-destruktif):** terapkan ulang isi `20260924000001_endpoint_try_runs.sql` (CREATE TABLE IF NOT EXISTS + 2 indeks + RLS + 4 policy). Verifikasi: `to_regclass` → `endpoint_try_runs`, `SELECT count(*)` → 0. File migrasi sudah committed di submodule (`12129c6`), jadi tidak ada drift git.
- **Ketahanan kode:** semua query `endpoint_try_runs` (`save/list/delete/quota/cleanup`) kini memetakan error schema-cache ke pesan ramah ID; `page.tsx` load kuota & riwayat via `Promise.allSettled` agar satu gagal tidak mematikan yang lain.
- **Metrik (`EndpointTryClient.tsx`):** hasil chat kini pakai `MetricBox` + label `lab.result` yang sama dengan Lab Chat (In/Out/Total/Latency/Speed/Finish); latensi List Model ditampilkan (`modelsLatency`); streaming ukur wall-time client (bukan 0) + catatan token tak tersedia; tombol `Kirim (Stream)` dipisah dari checkbox; bug duplikasi teks stream diperbaiki (hanya proses chunk baru).
- **Riwayat:** `ListOptions` + `dir/providerKind/modelQuery/status` (DB-driven: `eq/ilike/is/not`, `count: exact`); UI filter status/kind/cari model/sort + pagination Prev/Next + hapus dengan re-fetch; tanggal via `formatDateTime(locale, timeZone)`; badge kuota ditampilkan.
- **i18n:** tambah `lab.try.sendStreamButton/modelsLatency/modelSearchPlaceholder/streamUsageNote` (id+en parity).
- **Test:** mock supabase di `actions.test.ts` dukung multi-`eq` + `ilike/is/not` + count terfilter; 2 test baru (filter kombinasi, sorting asc/desc). Total endpoint-try: 13 tests.
- **Fix insidental:** `FeaturedProductBoard.test.tsx` TS2349 (`release?.()` → `releaseRef.current?.()`) agar `typecheck` hijau.

## Asumsi & risiko
- Estimasi token stream TIDAK dibuat — tampil `-` + catatan jujur (angka palsu lebih buruk daripada kosong).
- Filter model pakai `ilike %q%` (tanpa indeks trigram); aman untuk skala riwayat per-user.
- `npm run lint` standalone tidak bisa jalan (instalasi `eslint` di `node_modules` rusak/Index invalid — pre-existing, plus 1 upaya repair gagal karena file terkunci Windows). Pengganti: `next build` menjalankan lint+typecheck bawaan → tidak ada warning di file yang diubah; `tsc --noEmit` hijau.

## Verifikasi
- `npm run typecheck` ✓ hijau.
- `npm test` ✓ 117 files / 1152 tests hijau (1 run awal sempat 21 suite gagal resolve `next/*` karena lock file transien pasca-`npm install`; run ulang bersih).
- `npm run build`: compile ✓, lint+typecheck ✓ (tanpa warning di file diubah), static 93/93 ✓; gagal di langkah akhir rename `500.html` (race filesystem Windows, unrelated).
- MCP: tabel ada, 0 baris, queryable.

## Commit
- `fix(lab): endpoint try metrics, history filters, missing-table handling` (7 file, tanpa menyentuh file agen lain yang sedang aktif di working tree).

## Tindak lanjut (user)
- Verifikasi live: login → `/id/lab/try` → Uji List Model (lihat latensi) → Kirim + Kirim Stream (lihat MetricBox) → filter/sort/pagination riwayat → hapus 1 run.
