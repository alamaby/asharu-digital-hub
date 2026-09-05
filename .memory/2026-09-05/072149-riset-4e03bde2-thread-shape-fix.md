# Riset 4e03bde2 — Fix 1 Topik & thread_shape

Tanggal: 2026-09-05 07:21 (local time)

## Task / Problem
Riset `4e03bde2-3742-4e86-970f-3ef08b6d65db` hanya hasilkan 1 topik (IFA 2026 generik, tidak match hint coffee-maker) dan `status=failed` dengan `error_message: developing: 1 topik gagal`. Validasi via MCP `supabase-asharu-be-production` (read-only SELECT + apply_migration + UPDATE status backfill).

## Key Files Changed
- `plans/2026-09-05-riset-4e03bde2-1-topik-thread-shape-fix.md` — plan (1 file = 1 plan)
- `supabase/migrations/20260905000003_thread_shape_10.sql` — `thread_shape <=5 → <=10`, applied production via MCP
- `src/lib/research/thread.ts` — `MAX_THREAD_REPLIES_DB=10` + `threadSchema.max()` pakai konstanta
- `src/lib/research/development.ts` — import konstanta + guard pre-insert (fail cepat, bukan 23514)
- `src/lib/research/prompts.ts` — `DiscoveryInput.requiredWinners/isRetryPass` + instruksi niche-hint & retry-pass
- `src/lib/research/discovery.ts` — `chunkSourcesForLLM` prioritas topicHint + second-pass merge dedup (reuse chunk, 1x)
- `src/lib/research/orchestrator.ts` — teruskan `requiredWinners` ke `DiscoveryInput`
- `src/lib/research/development.test.ts` — case `MAX_THREAD_REPLIES_DB=10` + 7 replies lolos

## Decisions
- Strategi thread_shape: longgarkan ke 10 (bukan slice 7→5) — selaras `threadSchema.max(10)`; `maxChars 280` tetap hard limit (user pilih opsi 1).
- Backfill: kedua sesi (`4e03bde2` 1 shortlisted, `f7c91699` 3 shortlisted, 0 draft) dikembalikan ke `developing` agar cron retry (user setuju).
- Second-pass discovery: cap 1x, reuse chunk search (tanpa cost Tavily ekstra), merge dedup (user setuju).
- Tetap boleh `<minimumCandidates` (anti-filler) tapi guard `requiredWinners=3` picu retry.

## Assumptions / Risks
- Asumsi: cron `asharu-content-research` */5 akan pick up 2 sesi (stage_started_at diset 6 menit lalu, lewat guard 5 menit).
- Risiko: thread 6-10 replies lebih panjang di platform non-threads — mitigasi maxChars + paginasi UI existing.
- Terbuka: `verification.ts:81` force `rejected→unverified` sembunyikan future-dated (IFA 2026) — audit prompt verifying berikutnya, bukan sesi ini.
- Standar: TOGAF proporsional bugfix; bukan telecom → C2M/TMForum tidak berlaku.

## Blockers / Unresolved
- Tidak ada. Sisa pantau: 2 sesi backfill → `completed` + draft terisi (cek `/admin/riset` / `content_drafts`).

## Verification
- `vitest run`: 35 files, 263 tests passed (termasuk 42 development.test.ts + case baru).
- `tsc --noEmit`: bersih.
- DB: `pg_get_constraintdef thread_shape` = `<=10` ✓; 2 sesi `status=developing, error_message=null` ✓.

## Commit Proposal
`fix(research): thread_shape 10 + discovery retry for 1-topic sessions`

## Related
- Plan: `plans/2026-09-05-riset-4e03bde2-1-topik-thread-shape-fix.md`
