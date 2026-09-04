# Plan: Draft Deep-Link, Opener Afiliasi, Parse-Fail Resilience, Reply 6+1

Created: 2026-09-04 03:35:00

## Objective
Perbaiki 4 isu user: (1) klik draf di halaman detail riset harus langsung ke detail draf (`/konten/review/[draftId]`), bukan ke list; (2) rule baru opener sisipan afiliasi wajib diawali varian "btw / intermezzo dulu ya / sejenisnya" (+ padanan EN); (3) diagnosis sesi `2aa5be7d-ea55-47dd-afbf-7e683ae076b2` yang `Error: thread parse failed` padahal sudah ada 3 draf, dan tentukan apakah "Lanjut dari Titik Gagal" menyelesaikan; (4) Threads targetkan minimal 6 reply konten di luar reply produk afiliasi (total 7) agar lebih detail & engaging.

## Scope
- In: `src/app/[locale]/admin/riset/[sessionId]/page.tsx` (draft cards), `src/lib/llm/prompt.ts` (thread + rewrite rule + opener), `src/lib/research/thread.ts` (template + parse), `src/lib/research/development.ts` (default count, maxTokens, per-topic guard), `src/lib/content/actions.ts` (resume path), `ResearchSessionActions.tsx`, `messages/*.json`, tests.
- Out: discovery/verification/scoring, scraper, Vault/cron infra.

## Milestones
1. Deep-link draf (T1)
2. Opener rule + template (T2)
3. Diagnosis 2aa5be7d (T3)
4. Hardening parse per-topic (T4)
5. Reply 6+1 + maxTokens (T5)
6. Verifikasi + commit + push (T6)

## Tasks
- [x] T1 Deep-link: `riset/[sessionId]/page.tsx:340-343,361-366` — kartu draf `href` ke `/konten/review/[draftId]` dengan `params: { draftId: d.id }`; link list tetap sebagai "Lihat semua review".
- [x] T2 Opener: konstanta `AFFILIATE_OPENERS_ID = ["Btw,", "Intermezzo dulu ya,", "Ngomong-ngomong,", "Oiya,", "Eh iya,"]`, `EN = ["By the way,", "Quick intermezzo,", "Speaking of which,", "Oh, and"]`. Rule di `buildThreadPrompt` + `buildSingleReplyRewritePrompt`: reply affiliate WAJIB diawali salah satu varian (pilih natural). Update `BASA_BASI_TEMPLATE` di `thread.ts:29` jadi salah satu varian ("Btw, ..."). Unit test prefix.
- [x] T3 Diagnosis: query `content_research_logs` (stage=developing, session 2aa5be7d, DESC) + `llm_call_logs` (stage=developing, request_id=session) — cek pola: invalid JSON vs schema fail (>10 replies / field kosong) vs truncate (maxTokens implisit). Vonis transient vs sistematis; jawab apakah resume cukup.
- [x] T4 Hardening: `generateAndInsertDraft` tidak throw langsung — bungkus try/catch per-topik di loop `runDevelopment`; kumpulkan `failedTopics`; 1x retry LLM saat parse fail dengan temperature 0.5; log `topicId+rank`; jika ≥1 draf baru OK tapi ada gagal → status tetap completed + `error_message` warn parsial? Minimal: jangan gagalkan seluruh sesi karena 1 topik. (Perhatikan state-machine: developing→completed/failed.)
- [x] T5 Reply 6+1: default konten 6 + affiliate di tengah = total EXACTLY 7 (Threads/Twitter). `development.ts:133` ubah default 6→7; prompt `replyRule` jelaskan "6 konten + 1 affiliate"; `maxTokens: 2200`; clamp `Math.min(n,10)`; perbarui hint `targetReplyCount` di form/messages.
- [x] T6 Verifikasi: `npm test` (240+ baru), `npx tsc --noEmit`, `npx next lint`; commit Conventional Commits; push origin main.

## Risks
- Deep-link param salah → 404 draft. Mitigasi: tiru pola `pathname: '/konten/review/[draftId]'` dari review list (`ReviewListClient.tsx`).
- Opener baku → repetitif di semua thread. Mitigasi: daftar varian, "pilih yang paling natural", EN padanan.
- Per-topic catch menyembunyikan error sistematis. Mitigasi: tetap log error + `failedTopics` di `error_message`, threshold: jika >50% topik gagal → `failed`.
- 7 reply bilingual → truncate/parse fail naik. Mitigasi: `maxTokens 2200`, clamp schema 10, 1x retry.

## Progress Log
- 2026-09-04 03:30 — Plan didraft (plan mode).
- 2026-09-04 03:35 — Build mode; mulai eksekusi T1.
- 2026-09-04 08:20 — T1 deep-link + routing `/konten/review/[draftId]`; T2 opener ID/EN + `BASA_BASI_TEMPLATE_EN`; T3 diagnosis 2aa5be7d: LLM return `replies` string[] bukan object (schema drift, topik rank 4 Acer Swift Blade) → 3 draf OK (rank 1-3) + 1 gagal → sesi failed; resume AMAN (idempotent skip 3 draf, hanya proses rank 4-6), tapi tanpa fix parser akan gagal lagi → T4 toleransi string-coerce + per-topic guard + 1x retry; T5 default 7 (6 konten+1 affiliate), maxTokens 2200. Test 245 passed, tsc OK, lint OK.

## Notes
- TOGAF proporsional ringan (Application/Data layer).
- Jawaban sementara isu 3: YA, "Lanjut dari Titik Gagal" aman dicoba (idempotent skip 3 draf existing) — T3 akan vonis apakah cukup atau perlu T4.
