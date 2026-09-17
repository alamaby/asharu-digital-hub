# Chat Lab — Pagination History + Statistik Rentang & Best

Created: 2026-09-17 13:10:00

## Objective
(1) Riwayat Uji dapat pagination DB-driven (count akurat + filter di DB);
(2) seksi statistik dikendalikan satu tab rentang (Hari ini/7/14/30 hari/Semua)
mencakup KPI + chart + papan peringkat Best provider & model baru.

## Scope
- In: kolom `has_error` + backfill; `listLabBatches` pagination + join-filter;
  `getLabStats(range)` + cap 1000; `rankProviders/rankModels` (best = sukses%
  tertinggi, tie-break tok/s); UI pagination + tab rentang + tabel peringkat;
  i18n; tests; live verify.
- Out: agregat SQL view (cap 1000 + catatan sampling bila tembus); estimasi token.

## Milestones
1. Migrasi + apply prod
2. Actions pagination + range + tests
3. Ranking murni + tests
4. UI + i18n + tests
5. Gate + commit/push + memori

## Tasks
- [x] Migrasi `20260918000002_chat_lab_has_error.sql` + apply + verifikasi
- [x] `listLabBatches({page,pageSize})` + count + join-filter + mock `range`
- [x] `getLabStats(range)` + `rangeStart` murni + tests
- [x] `rankProviders/rankModels` + tests (tie-break, NULL, kosong)
- [x] `LabHistory` pagination UI + `LabStats` tab + `LabRankTables` + tests
- [x] i18n id/en + gate + commit + push + memori

## Risks
- Count + `!inner` join bisa hitung baris join, bukan batch → verifikasi saat
  implementasi; fallback dua-query (ids dari runs dulu).
- Cap 1000 all-time = sampel bila tembus → catat; view SQL fase lanjut.
- `today` 00:00 UTC konsisten dengan definisi kuota (bukan WIB) → label jujur
  di UI bila perlu.

## Progress Log
- 2026-09-17 13:10:00 — Plan dibuat + eksekusi dimulai (mode build).

## Notes
- Best = sukses% tertinggi, tie-break tok/s tertinggi; NULL diabaikan (bukan 0).
- Tanpa ubah RLS; migrasi aditif + backfill.
