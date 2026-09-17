# Chat Lab — 4 Peningkatan (Highlight, Cloudflare Usage, Detail, Kartu Share)

Created: 2026-09-17 12:20:00

## Objective
Empat feedback user atas Chat Lab (`/lab`, live `7541c8d`): (1) highlight metrik
terbaik di hasil komparasi + chart; (2) token Cloudflare selalu kosong — perbaiki;
(3) halaman detail history `/lab/[batchId]` lengkap (metrik + chart + log);
(4) generate kartu gambar 1080×1080 untuk share sosmed.

## Scope
- In: `findWinners` murni + highlight grid/chart + i18n; parse `usage` respons
  Workers AI `/ai/run` (tahap B endpoint OpenAI-compatible hanya bila tahap A nihil
  di live); rute `/lab/[batchId]` reuse `getLabBatch` + `LabCompareGrid` +
  `LabStats`; route `GET /api/lab/[batchId]/card` via `next/og` + tombol
  Unduh/Bagikan; tests + live verify.
- Out: estimasi token (tetap `-` jujur bila provider tak lapor); auto-retry stream;
  hapus jalur sync; migrasi DB (tidak perlu — kolom sudah ada).

## Milestones
1. Winners + highlight (grid + chart) + i18n + tests
2. Cloudflare usage A (+B bila perlu) + live verify
3. Detail route + tombol history
4. Kartu share + tombol + gate + commit/push + memori

## Tasks
- [x] `findWinners` di `lib/lab/stats.ts` + tests (terendah/tertinggi/seri/NULL)
- [x] Highlight `LabCompareGrid` (ring + badge) + `LabStats` (bar penuh vs muted)
- [x] i18n `lab.result.bestLatency/bestSpeed/bestTokens/legend` + `lab.stats.legend`
- [x] Cloudflare: parse `result.usage|usage` + tests fixture
- [ ] Live verify token Cloudflare (tahap B bila nihil) [USER ACTION]
- [x] routing `/lab/[batchId]` + page detail + tombol "Buka detail" di history
- [x] `GET /api/lab/[batchId]/card` (next/og 1080) + Unduh/Bagikan + i18n `lab.detail.*`
- [x] Gate typecheck/lint/test/build + commit + push + memori

## Risks
- Token-terendah disalahartikan "terbaik" → label "Paling hemat", tanpa skor gabungan.
- Tahap B (ganti endpoint) risiko regresi → diisolasi akhir, dibatalkan bila A sukses.
- Kartu login-gated: share = unduh + upload manual (crawler tak lewat login).
- next/og flex terbatas → desain kartu flat minimalis.

## Progress Log
- 2026-09-17 12:20:00 — Plan dibuat + eksekusi dimulai (mode build).

## Notes
- Definisi menang: latensi terendah, speed tertinggi, token total terendah; hanya
  run sukses ikut; NULL didiskualifikasi; seri ikut semua.
- Secret tetap server-side; RLS owner tak berubah.
