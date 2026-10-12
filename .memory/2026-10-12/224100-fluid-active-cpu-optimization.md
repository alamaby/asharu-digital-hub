# Fluid Active CPU Optimization

Tanggal: 2026-10-12 22:41 WIB
Status: Selesai

## Task / Masalah
Menurunkan penggunaan Fluid Active CPU `asharu-digital-hub` dari 3h 16m / 4h (96,7% kuota Hobby) ke < 2h / 4h per bulan sesuai `plans/2026-10-12-fluid-active-cpu-optimization-plan.md` dengan mempertahankan seluruh pipeline perilaku eksisting:
1. S01: Kontrak log idle + test invariant 7 rute cron (`src/test/cron-idle-contract.test.ts`).
2. S02: Fast-path disabled + dynamic import `runAutomationTick` di `/api/automation/run` (`src/app/api/automation/run/route.ts` & test).
3. S03: Lazy import `runErrorDigestTick` di `/api/notifications/error-digest` (`src/app/api/notifications/error-digest/route.ts` & test).
4. S04: Reorder klaim sebelum decrypt Vault / Meta API di `/api/social/post` + lazy import Threads network helpers (`src/app/api/social/post/route.ts` & test).
5. S05: Fix N+1 query loop di `enqueueNextMissingImage` (2 query max) + lazy import di `/api/image/generate` (`src/lib/image/worker.ts`, route, & test).
6. S06: `MAX_PER_TICK 5→2` + isolasi error continue di `/api/studio/process` (`src/app/api/studio/process/route.ts` & test).
7. S07: Reschedule 4 pg_cron job di submodule `supabase/` (`20261012000001_cron_cpu_savings.sql` + test SQL, commit `49ee434` pushed).
8. S08: Deadline LLM 90s (`deadlineMs: 90_000`) untuk 3 call site path image/studio LLM (`src/lib/image/worker.ts`, `src/lib/studio/worker.ts`, & test).
9. S09: Turunkan `maxDuration` poller ringan (automation=120, social=120, studio=180) + invariant test (`src/test/route-maxduration.test.ts`).
10. S10: Homepage `/[locale]` ISR verification didokumentasikan untuk observasi 24 jam pasca-deploy (USER ACTION).

## Berkas Penting yang Diubah
- `src/app/api/automation/run/route.ts` — Fast-path check `isEnabled` & lazy import runner; `maxDuration` 120s.
- `src/app/api/notifications/error-digest/route.ts` — Lazy import `runErrorDigestTick`.
- `src/app/api/social/post/route.ts` — Reorder klaim sebelum decrypt Vault & Meta API; lazy import `threads.ts`; `maxDuration` 120s.
- `src/app/api/image/generate/route.ts` — Lazy import `processImageTick`.
- `src/app/api/studio/process/route.ts` — `MAX_PER_TICK` 2; continue saat gagal; lazy import worker; `maxDuration` 180s.
- `src/lib/image/worker.ts` — Fix N+1 `enqueueNextMissingImage` (2 queries); `deadlineMs: 90_000` di 2 call site LLM.
- `src/lib/studio/worker.ts` — `deadlineMs: 90_000` di call site LLM compose studio.
- `src/lib/llm/completion.test.ts` — Test `deadlineMs override respected`.
- `src/lib/image/worker.test.ts` — Test `enqueueNextMissingImage` (skips covered, null when covered, <=2 queries) & deadline 90s reasoning.
- `src/lib/studio/worker.test.ts` — Verifikasi suite studio worker hijau.
- `src/lib/social/queue.test.ts` — Test `idle does not require token`.
- `src/lib/notifications/error-digest.test.ts` — Test `empty config returns not-sent`.
- `src/lib/automation/runner.test.ts` — Test `disabled fast-path returns same shape`.
- `src/test/cron-idle-contract.test.ts` — Test kontrak 7 rute cron saat idle.
- `src/test/route-maxduration.test.ts` — Invariant test konfigurasi `maxDuration` seluruh cron route.
- `src/app/api/automation/run/route.test.ts` — Test lazy import & fast-path disabled di route automation.
- `src/app/api/social/post/route-order.test.ts` — Test idle tick tidak menyentuh Vault/Meta network.
- `src/app/api/studio/process/route-tick.test.ts` — Test `MAX_PER_TICK=2`, error isolation continue, dan empty break.
- `supabase/migrations/20261012000001_cron_cpu_savings.sql` — Reschedule 4 pg_cron jobs dengan `IF EXISTS` guard & rollback comments.
- `supabase/tests/cron_cpu_savings.test.sql` — Query verifikasi jadwal cron post-apply.
- `plans/2026-10-12-fluid-active-cpu-optimization-plan.md` — Progress log dan task tracking.

## Keputusan Teknis & Bisnis
- Mengadopsi dynamic `import()` pada tick cron agar memory & bundle LLM tidak dimuat saat antrean kosong / poller idle (>80% waktu).
- Reorder klaim di `/api/social/post` sebelum RPC Vault & Meta network call memotong beban komputasi & network saat antrean kosong.
- Fix N+1 di `enqueueNextMissingImage` mereduksi query dari hingga 21 query menjadi tepat 2 query batch (`in('draft_id', ids)`).
- `MAX_PER_TICK` 2 di studio worker meratakan spike CPU 10 menit tanpa risiko starvation berkat semantik `continue` pada error.
- Deadline LLM 90s memutus hanging provider (naraya) lebih awal dari default 240s agar waterfall cepat fallback.
- Migrasi `pg_cron` memakai `jobid` subselect dinamis berdasarkan `jobname` dengan guard `IF EXISTS` untuk mencegah kegagalan migrasi dan drift ID numerik.
- Submodule `supabase/` di-commit (`49ee434`) dan di-push terpisah sebelum parent pointer.

## Asumsi & Risiko
- Asumsi: Penjarangan cron (15m untuk automation, social, error-digest; 10m untuk studio) dapat diterima secara operasional tanpa keluhan latensi (tombol admin "Run now" tetap tersedia).
- Risiko: Durasi publish artikel bila melebihi 120s pada automation akan di-retry pada tick berikutnya secara idempoten.

## Blocker / Open Item
- [USER ACTION] Eksekusi migrasi `20261012000001_cron_cpu_savings.sql` ke database produksi Supabase (via SQL Editor / MCP).
- [USER ACTION] Deploy Vercel Production.
- [USER ACTION] Amati Vercel Observability 24 jam pasca-deploy untuk memverifikasi penurunan Active CPU dan memastikan fungsi tidak terbunuh.

## Verifikasi yang Dilakukan
- `npm run typecheck` → PASS (0 error).
- `npm run lint` → PASS (0 error, 0 warning).
- `npm test` → PASS (140 files, 1366 tests).
- `npm run build` → PASS (122+ pages, 0 warning).
- Submodule `git -C supabase push origin main` → PASS (`49ee434`).

## Proposed Conventional Commit
`perf(cron): optimize idle pollers, fix N+1 image enqueue, and lower maxDuration`

## Link Terkait
- Plan: `plans/2026-10-12-fluid-active-cpu-optimization-plan.md`
