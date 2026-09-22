# Automation Multi-Slot Starvation Fix — S1–S4 selesai, handoff

Date: 2026-09-22 21:46:00 (Asia/Jakarta)

## Task

Implementasi fix starvation slot `sore` di `runAutomationTick` sesuai plan `plans/2026-09-22-automation-multislot-starvation-fix.md`.

## Files Changed

- `src/lib/automation/runner.test.ts` — S1 (mock `.in()`) + S2 (3 test regresi)
- `src/lib/automation/runner.ts` — S3 (early-return → continue + ORDER BY + final already_done)

## Technical Decisions

- **F1 root cause**: early-return `return { ok:true, skipped:'already_done', ... }` di dalam loop `for (const run of Object.values(existingRuns))` membuat `sore:session_created` tidak pernah diproses bila `default:completed` muncul duluan di `Object.values`.
- **Fix**: ganti kedua `return` dengan `continue`; tambahkan blokir akhir `if (!hadOpenRun && results.length===0 && created.length===0)` yang mengumpulkan semua terminal runs, sort by `slot_key`, return deterministik.
- **ORDER BY** ditambahkan di query `automation_runs` agar urutan deterministik di prod.
- **Mock `.in()`**: ditambahkan paralel dengan `eq` di objek return `update().eq()`, mendukung chaining hingga kedalaman 3 level.

## Verification

- S2 (merah sebelum S3): T2a, T2c gagal `expected 'already_done' to be undefined` — membuktikan bug F1.
- S3 (hijau setelah fix): 22 test runner.test.ts, 21 passed + 1 failed (pre-existing `blackoutDays=0` — diverifikasi `git stash` sebelum perubahan tetap gagal).
- S4 gate: typecheck ✓, lint ✓ (0 errors), build ✓ (`Compiled successfully`, 86 pages).
- `git diff --stat`: hanya `runner.test.ts` (+140) + `runner.ts` (+25/-9). Tidak ada file lain.

## Blocked / Pending

- **S5**: menunggu deploy Vercel + observasi prod (read-only query `automation_runs`, `content_research_sessions`, `content_research_logs`).
- **S6**: keputusan A/B untuk run basi 20/21 Sep — rekomendasi A (biarkan/failed manual via UI).
- Plan explicitly states: `Jangan lakukan: git add/commit/push` — tangan ke reviewer untuk review.

## Pre-existing Failure (not from this fix)

- `blackoutDays=0 → tanpa query gte, semua produk tersedia` (runner.test.ts ~line 493) selalu gagal sejak sebelum perubahan ini. Root cause belum diselidiki di scope plan ini.

## Commit Proposal

```
fix(automation): eliminate multi-slot starvation in runAutomationTick

- Add .order('slot_key') to automation_runs query for deterministic iteration
- Replace early-returns on completed/failed with continue; evaluate all runs
- Add final single already_done decision after full scan of existing+created runs
- Expand mock makeClient with .in() support for update chains (up to 3 levels)
- Add 3 regression tests: T2a (default-first), T2b (reversed order), T2c (force create+advance)

S1-S3 complete. S4 gate passed. S5/S6 pending manual verification post-deploy.
```
