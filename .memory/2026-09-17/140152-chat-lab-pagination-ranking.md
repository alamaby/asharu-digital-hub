# Chat Lab — Pagination History + Statistik Rentang & Best

- Plan: `plans/2026-09-17-chat-lab-pagination-ranking.md`
- Commit: `7467351` — `feat(lab): pagination riwayat dan statistik rentang dengan papan peringkat`
  (parent); submodule `e1cfcfa` — `feat(db): flag has_error chat lab untuk pagination`. Pushed.

## Masalah / Tugas
(1) Riwayat Uji tanpa pagination (limit 20, filter di memori); (2) statistik best
provider & model per rentang Hari ini/7/14/30 hari/Semua.

## Perubahan kunci
- Migrasi `20260918000002` — `has_error` denormalisasi di `chat_lab_batches` +
  backfill (prod: 6 batch, 4 with_error terverifikasi) + index; applied prod via MCP.
- `listLabBatches({page,pageSize})` — `range` + `count exact`, filter status via
  `has_error`, filter provider/model via pra-query runs (dua-query agar count
  menghitung batch, bukan baris join); return `LabBatchPage`.
- `getLabStats(range='30d')` + `rangeStart` murni (`today` = 00:00 UTC, konsisten
  kuota) + cap 1000 runs untuk `all` (sifat sampling dicatat).
- `rankProviders/rankModels` murni: best = sukses% tertinggi, tie-break tok/s
  (NULL diabaikan — adil untuk Cloudflare); `summarizeLabRuns` sertakan `ranks`.
- UI: `LabHistory` pagination (Prev/Next + "Halaman X dari Y · N", reset hal. 1
  tiap submit/filter, mundur otomatis bila halaman kosong pasca-hapus) +
  dropdown filter dari katalog aktif; `LabStats` tab rentang (kendalikan KPI +
  chart + peringkat) + `LabRankTables` (tabel semantik, ★ juara best-first).
- i18n `history.pageOf/prev/next`, `stats.range*/rank*` — id/en paritas.

## Keputusan / Asumsi / Risiko
- Denormalisasi `has_error` dipilih atas filter-status-di-memori (halaman tak
  konsisten) — satu-satunya cara count akurat di DB.
- Dua-query (bukan `!inner`) untuk filter provider/model — hindari ambiguitas
  count baris join; diverifikasi via test mock.
- Cap 1000 all-time: fase lanjut ganti view SQL bila tembus.
- Insiden shell: path `[locale]` harus dikutip di PowerShell (gagal sekali,
  retry sukses) — pelajaran git-add bertanda kurung.

## Blocker / Belum
- [USER ACTION] Live verify: pagination (buat >10 batch / ubah pageSize mental),
  tab rentang (Hari ini vs Semua), papan peringkat + ★ juara.

## Verifikasi
- `typecheck` ✓, `lint` ✓, `test` 767/767 (89 files; +13 baru) ✓, `build` ✓.

## Commit
- `feat(lab): pagination riwayat dan statistik rentang dengan papan peringkat`
  (`7467351` parent + `e1cfcfa` submodule, pushed).
