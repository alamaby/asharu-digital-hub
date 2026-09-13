# Riset 9a24c768 — Gate Produk-Tetap Developing: Transient Cap + Observability

Created: 2026-09-13

## Objective
Gate produk-tetap (mekanisme dua) di `runDevelopment` tidak boleh mematikan sesi
terminal atas pembacaan transient; kegagalan permanen harus berpesan jelas
(dengan ID produk), terlog, dan sesi yang tersisa bisa di-resume tanpa buang
topik/draf.

## Root Cause (ringkas)
- Sesi `9a24c768-07ba-498d-a290-6280bbceb0da` (`mechanism='dua'`) gagal dengan
  `error_message='developing: produk tetap tidak aktif/hilang'` setelah 6/8 draf
  sukses (`llm_call_logs` semua HTTP 200, produk `is_active=true` baik saat itu
  maupun sekarang). Gate `development.ts:140-158` menyatukan 3 kasus berbeda
  (join kosong/transient, semua nonaktif, tanpa produk terdaftar) menjadi satu
  `failed` tanpa log; tick terakhir membaca kosong (transient) → sesi dimatikan.
- Kegagalan final tidak menulis log dan tidak menyentuh `updated_at`.

## Scope
- `src/lib/research/development.ts` — pisahkan klasifikasi gate produk-tetap.
- `src/lib/content/actions.ts` — `advanceToDevelopment` validasi + snapshot produk.
- `scripts/scrape-affiliate.mjs` — guard mass-deactivation 20%.
- Test: `src/lib/research/development.test.ts` (+ lib scraper bila ada pola test).

## Keputusan User (2026-09-13)
1. Cap retry transient: YA (5 deferral / 24 jam → gagal permanen).
2. Sesi `9a24c768`: resume sisa 2 pasangan (rank 5 × twitter × 2 produk)
   setelah fix ter-deploy — pertahankan 6 draf existing.
3. Guard scrape: abort soft-delete bila removal > 20% aktif.

## Tasks
- [x] RCA + validasi data via MCP (read-only).
- [x] `development.ts`: helper murni `classifyFixedProducts` + gate baru
      (none-configured → failed jelas; transient-empty → defer ke tick
      berikut + cap 5/24j via hitung log warn; all-inactive → failed dengan
      ID produk; partial → lanjut aktif + warn).
- [x] `development.ts`: set `updated_at` eksplisit di semua `UPDATE status='failed'`
      (termasuk orchestrator catch) agar timeline akurat.
- [x] `actions.ts` `advanceToDevelopment`: validasi produk tetap aktif untuk
      mekanisme dua + snapshot ke `content_research_logs` sebelum advance.
- [x] `scrape-affiliate.mjs`: abort soft-delete bila removal > 20% aktif
      (override eksplisit `--allow-mass-deactivation`).
- [x] Test `classifyFixedProducts` (5 kasus) — hijau.
- [x] Gate: `npm run typecheck` + `npm run lint` + `npm test` hijau.
- [x] Commit + push (kode dulu, agar deploy Vercel selesai sebelum resume).
- [x] Resume sesi `9a24c768` via MCP (UPDATE status developing + log audit,
      atas persetujuan user; bukan full retry — topik & 6 draf dipertahankan).
- [x] Verifikasi pasca-resume via MCP: 8/8 draf, status `completed`.

## Risks
- Deferral tanpa cap = sesi zombie `developing` — mitigasi: cap 5/24j → failed.
- Cap terlalu kecil = gagal permanen palsu saat transient panjang — 5 × tick 5
  menit ≈ 25 menit toleransi; window 24 jam mencegah akumulasi silang hari.
- Guard scrape menahan sinkron sah saat toko benar-benar mengosongkan kategori —
  fail-loud by design; override via `--allow-mass-deactivation`.

## Progress Log
- 2026-09-13 — RCA selesai (validasi MCP: sessions/topics/logs/drafts/llm_call_logs/
  affiliate_products), keputusan user terkumpul, eksekusi dimulai.
- 2026-09-13 14:00 — Implementasi + test selesai; gate hijau (typecheck ✓ lint ✓
  536/536 test); commit `3fafebe` pushed (origin/main, 6 files +356/-9).
- 2026-09-13 14:01 — Sesi `9a24c768` di-resume via MCP: status `failed` →
  `developing`, `error_message=NULL`, `current_stage_started_at` backdate 10 mnt,
  log audit ditulis. Menunggu cron tick (*/5) memproses 2 pasangan sisa
  (rank5 × twitter × ASH-242/243) → verifikasi pasca-deploy.
- 2026-09-13 14:25 — Tick cron 07:00–07:20 UTC `advancePendingSessions: Gateway
  Timeout` (Supabase 504 transient, fail-loud; sesi tetap `developing` — bukti
  fix baru bekerja: tidak ada false-failed). Tick 07:25 `{"advanced":1}`:
  2 draf sisa dibuat, sesi `completed`, 8/8 draf `needs_review`. 1 draf
  OVER-LIMIT (290/280) sudah ber-flag `llm_meta.over_limit` + log warn
  (perilaku by-design: simpan + tandai, edit sebelum posting). Selesai.
- 2026-09-13 14:35 — Memory entry + index update: commit `5d5a272` pushed.
  Tugas selesai penuh (RCA → fix → resume → verifikasi → dokumentasi).

## Notes
- Non-telecom, bugfix rutin → TOGAF proporsional saja (AGENTS.md §3).
- Tanpa migrasi DB (submodule supabase tidak berubah): cap memakai hitungan
  `content_research_logs` (pola `retryOwnSession`), `updated_at` diset eksplisit
  di kode — non-destruktif.
- RLS/keamanan tidak berubah.
- Temuan RCA tambahan (post-resume): akar transient terkonfirmasi = Supabase
  Gateway Timeout (504) yang intermiten di tick cron — `fetchFixedProducts`
  lama menelan error via destructuring `data=null`; gate lama salah klasifikasi
  `failed`. `advancePendingSessions` sendiri juga kena 504 yang sama tapi
  fail-loud tanpa merusak sesi — pemulihan otomatis via cron.
- Follow-up opsional: retry `advancePendingSessions` 1x pada Gateway Timeout
  (pola `fetchOrderedImageKeys`, insiden 2026-09-12 f10d58e2) — tidak dikerjakan
  di skop ini.

## Notes
- Non-telecom, bugfix rutin → TOGAF proporsional saja (AGENTS.md §3).
- Tanpa migrasi DB (submodule supabase tidak berubah): cap memakai hitungan
  `content_research_logs` (pola `retryOwnSession`), `updated_at` diset eksplisit
  di kode — non-destruktif.
- RLS/keamanan tidak berubah.
