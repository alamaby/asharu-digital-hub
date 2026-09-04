# Plan: Idea Variety + Disabled, LLM Logs Lengkap, 90% Length + Emoji + URL, Paste-Link Analysis

Created: 2026-09-04 11:00:00

## Objective
(1) Generate Idea bervariasi tiap klik (opsi A lengkap) + semua field disabled saat generating; (2) LLM Logs kembali terisi lengkap via migrasi (akar: FK `request_id`→`content_requests` + `requestId` idea non-UUID + error insert diswallow); (3) tiap post ±90% max_chars + 1–2 emoji relevan, post afiliasi hitung panjang URL; (4) link yang dipaste di Topik ditelusur (Tavily extract) dan dianalisa LLM jadi topik.

Keputusan user: 1A lengkap, migrasi logs setuju, target 90% + URL budget, + paste-link analysis.

## Scope
- In: `actions.ts` (`generateIdea`, `createResearchSession`), `ContentRequestForm.tsx`, `completion.ts`, `search.ts` (`extractUrlContent`), migrasi `llm_call_logs` (drop FK + `session_id`), halaman `admin/llm/logs`, `prompt.ts` (length/emoji/URL), `development.ts` + legacy (`maxTokens`), tests, `messages/*.json` (hint + copy baru).
- Out: scoring/verification, scraper, Vault/cron.

## Milestones
1. Plan + T1 idea variety + T2 disabled
2. T3 migrasi + T4 observability/logs lengkap
3. T5 length/emoji/URL + T6 paste-link
4. T7 verifikasi + push

## Tasks
- [x] T1 Idea A-lengkap: semua field terisi dikirim (client+server) + `varietySeed` + instruksi anti-ulang; temp 1.0; `requestId: null`
- [x] T2 Disabled 6 field (`topic:243`, `targetReplyCount:465`, `freshnessHours:598`, `minimumCandidates:613`, `requiredWinners:628`, `maximumIterations:643`) — verifikasi tidak ada sisa `disabled={pending}` tunggal
- [x] T3 Migrasi `20260904000003_llm_logs_session_id.sql`: drop `llm_call_logs_request_id_fkey`, tambah `session_id` + index; applied + terverifikasi via pg_constraint
- [x] T4 `completion.ts`: param `sessionId`, insert `session_id`, error insert → `console.error`; semua caller riset pakai `sessionId` (discovery/verifying/scoring/developing×2/regen); halaman logs: filter stage + kolom sesi/req
- [x] T5 Rule `LENGTH_TARGET 90%` + `EMOJI 1-2` + `URL_BUDGET ±30 char` di thread + rewrite prompt; `maxTokens` dev 3200, legacy 3200, regen 600
- [x] T6 `src/lib/utils/urls.ts` (`extractUrls` + SSRF guard) + `TavilyProvider.extract` (`/extract`, timeout 20s, truncate 4000) → wire `generateIdea` (analisa konten link) + `runDiscovery` (prefix `[LINK USER]`, prioritas); fallback jujur + log warn
- [x] T7 `npm test` 261/261, `tsc OK`, lint OK, commit + push

## Risks
- Temp 1.0 + seed → ide ngawur. Mitigasi: hint lengkap mengikat + validasi schema.
- Drop FK melemahkan integritas. Mitigasi: `session_id` ber-FK proper; `request_id` tetap untuk legacy.
- 90% + bilingual 7 reply → truncate/parse-fail + biaya. Mitigasi: maxTokens 3200, retry existing, clamp 10.
- Extract: paywall/JS/latensi/SSRF. Mitigasi: timeout 20s, truncate 4000, allowlist http/https + blok privat, fallback jujur.
- Data log 2–4 Sep hilang permanen (tidak bisa backfill).

## Progress Log
- 2026-09-04 — Investigasi read-only: prompt idea static (5 hint), 6 field belum disabled, FK `request_id`→`content_requests` = akar log berhenti 1 Sep (+`idea-…` non-UUID), prompt tanpa length-target, tanpa fetch URL. Keputusan user: 1A, migrasi setuju, 90%+URL, +paste-link.
- 2026-09-04 11:00 — Build mode; FK name terkonfirmasi (`llm_call_logs_request_id_fkey`); mulai eksekusi.
- 2026-09-04 11:20 — Selesai: T1–T6 implemented; migrasi applied & verified; `npm test` 261/261 (+16: urls 9, prompt 3, +lainnya), `tsc OK`, lint OK.

## Notes
- TOGAF ringan (Application/Data). Verifikasi akhir: 3× Generate beda, field disabled, log developing terisi, post ≥90% max + emoji, paste URL → topik refleksikan isi.
