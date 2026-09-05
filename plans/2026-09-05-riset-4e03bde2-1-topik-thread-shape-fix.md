# Riset 4e03bde2 — 1 Topik & Gagal Developing (thread_shape) Fix

Created: 2026-09-05 11:00:00

## Objective
Perbaiki 2 akar masalah sesi `4e03bde2-3742-4e86-970f-3ef08b6d65db` (validasi Supabase `asharu-be-production`, read-only): discovery hanya hasilkan 1 topik IFA 2026 generik, dan developing gagal `draft insert violates check constraint "thread_shape"` karena LLM hasilkan 6-7 replies sementara DB batasi `<=5`. Pola sistemik: `f7c91699` (3/3 gagal sama), `641956c7` sukses karena LLM saat itu hanya hasilkan 2-3 replies.

## Scope
- DB: `content_drafts.thread_shape` `<=5` → `<=10` (non-destruktif, idempotent)
- BE: `development.ts` guard pre-insert, `thread.ts` konstanta selaras, `discovery.ts` second-pass retry + prioritas topicHint, `prompts.ts` tuning niche, `orchestrator.ts` teruskan `requiredWinners`
- Ops: backfill `4e03bde2` + `f7c91699` ke `developing` untuk retry cron/admin

## Milestones
1. P0 thread_shape selaras (DB + guard + test)
2. P1 discovery robustness (second-pass + prompt + topicHint priority)
3. P2 backfill + observability

## Tasks
- [x] P0-DB: migrasi `supabase/migrations/20260905000003_thread_shape_10.sql` + apply via MCP asharu-be-production
- [x] P0-BE: guard `development.ts` pre-validate `replies <= MAX_THREAD_REPLIES_DB (10)` + export konstanta di `thread.ts`
- [x] P0-Test: tambah case 7-replies lolos + `vitest` + `tsc`
- [x] P1-BE: `discovery.ts` second-pass bila `< requiredWinners` (relaxed categories/freshness, merge dedup, log warn)
- [x] P1-Prompt: tuning niche-derivative + prioritas topicHint sort di `chunkSourcesForLLM`
- [x] P1-Orchestrator: teruskan `requiredWinners` ke `DiscoveryInput`
- [x] P2-Ops: backfill 2 sesi ke `developing` via `execute_sql` (UPDATE status, bukan INSERT/DELETE data konten)
- [x] Verifikasi DB: `pg_get_constraintdef thread_shape` = `<=10`, re-run developing berisi draft

## Risks
- Thread 6-10 replies lebih panjang di platform non-threads — mitigasi: `maxChars 280` tetap hard limit + UI paginasi existing; alternatif slice 7→5 ditolak user (pilih longgarkan).
- Second-pass tambah cost Tavily/LLM — mitigasi: cap 1 retry, reuse chunk search yang sama (tanpa search ulang).
- Verifikasi `rejected→unverified` (`verification.ts:81`) tetap sembunyikan future-dated (IFA 2026) — tidak diblokir sesi ini, dicatat untuk audit prompt verifying berikutnya.

## Progress Log
- 2026-09-05 11:00:00 — Diagnosis via MCP asharu-be-production selesai: session failed developing:1 topik; topics=1 (IFA 2026, score 7.03, shortlisted); logs discovering 54 raw→1 parsed, verifying 0 results, developing thread_shape x2; llm_call_logs 5 rows gemini-3.5-flash-lite. User pilih: (1) longgarkan ke 10, (2) backfill ya, (3) second-pass boleh. Build mode aktif, eksekusi dimulai.
- 2026-09-05 07:25:00 — SELESAI: migrasi 20260905000003 applied (thread_shape <=10 ✓); BE guard + second-pass + prompt + requiredWinners; vitest 263/263 + tsc bersih; backfill 4e03bde2 + f7c91699 → developing. Pantau cron */5.

## Notes
- Standar: TOGAF proporsional untuk bugfix kecil (tanpa ADM penuh); domain bukan telecom/billing jadi Oracle C2M/TM Forum ODA tidak berlaku — tanpa deviasi yang perlu dijustifikasi.
- Counter-argument: memaksa selalu 12 topik akan hasilkan filler tak relevan (CTR turun). Desain tetap boleh `<12` tapi guard `requiredWinners=3` agar tidak 1 topik lolos ke developing.
- `threadSchema.max(10)` sudah selaras duluan; yang drift hanya CHECK DB `<=5`. Migrasi menutup drift ini.
