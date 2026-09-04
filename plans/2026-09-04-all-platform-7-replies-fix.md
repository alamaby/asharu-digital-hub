# Fix: Platform "all" Harus Dapat 6+1 Replies (Analisa Sesi 641956c7)

Created: 2026-09-04 11:48:00

## Objective
Sesi `641956c7-7de6-4e38-aa2c-4e4edb0fd3b6` (topic Mech Keyboard WFH) kualitas sudah membaik (parse OK, opener & fallback random benar, maxTokens 3200), tapi reply count hanya 3 (main+3) jauh dari target 6+1=7. Analisa `llm_call_logs` membuktikan prompt terkirim adalah fallback `0-2 for twitter...` bukan `EXACTLY 7`. Akar: `platform_slug=null` ("Semua Platform") → `isMultiReplyPlatform=false` → `targetReplyCount=null`.

## Scope
- In: `src/lib/research/development.ts:168-169` (isMultiReplyPlatform), `src/lib/llm/prompt.ts:50-74` (replyRule — sudah benar, hanya perlu dipicu), `ContentRequestForm.tsx:45` (sudah default 7), `process-legacy/route.ts` (sudah fix 7 legacy), tests.
- Out: discovery/verification/scoring, Vault/cron, scraper, sesi existing 641956c7 (perlu re-run manual).

## Milestones
1. Fix `development.ts` agar `all` ikut 7
2. Sinkron legacy + regression test
3. Verifikasi + commit + push

## Tasks
- [x] T1 `development.ts:168-169` — ubah `isMultiReplyPlatform` agar `'all'` ikut: `['threads','twitter','all'].includes(platform.slug)` atau `targetReplyCount ?? (platform.slug === 'instagram' ... ? null : 7)` — pilih yang paling eksplisit agar Semua Platform tetap pakai strict `maxChars 280` namun tetap `EXACTLY 7 (6 konten + 1 affiliate)`.
- [x] T2 Verifikasi prompt: sesi `all` tetap `Platform: all — Max 280` + `LENGTH 252 (90% of 280)` + `URL BUDGET 30` + `EXACTLY 7 replies total: 6 CONTENT + 1 AFFILIATE` — jangan ubah maxChars logic (keep strictest 280 untuk safety repost).
- [x] T3 `development.test.ts` — case: `platform all` harus hasilkan opener + 7 rule (mirror existing case threads).
- [x] T4 Tidak ada perubahan `ContentRequestForm.tsx:45` (sudah 7); `process-legacy/route.ts` sudah 7 untuk threads/twitter/all — cek konsisten.
- [x] T5 Existing draft `641956c7` tidak auto-repair — dokumentasikan: buat riset baru / resume after fix untuk verifikasi; cek `llm_call_logs.system` harus `EXACTLY 7` dan `generated_thread.replies.length===7`.
- [x] T6 `npm test` (target 249→250+), `tsc --noEmit`, lint, commit Conventional Commits, push origin main.

## Risks
- `all` 7 replies bilingual × ~280 char → token besar, risiko truncate/parse-fail naik. Mitigasi: `maxTokens 3200` sudah ada + retry suhu 0.3 + schema string-coerce.
- `all` dengan 280 char membatasi Threads (500) yang sebenarnya bisa lebih panjang. Mitigasi: keep 280 sebagai hard limit agar repost aman; future: per-platform preview bukan re-generate.
- Perubahan `isMultiReplyPlatform` mempengaruhi semua sesi baru — regresi kecil. Mitigasi: test case + TOGAF ringan (Application/Data) + keep fallback null untuk platform non-threads bila `target_reply_count` custom diisi user.

## Progress Log
- 2026-09-04 11:48 — Analisa 641956c7 selesai (platform `null`→`all`→`null` replyCount), plan dibuat, mulai eksekusi.
- 2026-09-04 14:25 — Fix: `development.ts:168` `+|| platform.slug==='all'` (+komentar safety 280), `process-legacy` sync `'all'`, test `platform all 7 replies` 41 passed, full suite 262/262, tsc OK, lint OK.

## Notes
- TOGAF proporsional ringan (Application/Data).
- Verifikasi pasca-fix: buat 1 sesi `platform=all` lalu cek `llm_call_logs.system` mengandung `EXACTLY 7 replies` dan `generated_thread.replies.length===7` (target ≥252 char/reply bila 90% rule aktif).
