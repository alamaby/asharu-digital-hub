# Content Pipeline 4-Tahap — Discovery→Verification→Scoring→Development (2 Sep)

Recorded: 2026-09-02 10:20

## Task / Problem
Mengganti processor single-pass (`/api/content/process`: 1 produk random → prompt → LLM → thread → draft) dengan pipeline riset 4-tahap persistent (admin checkpoint) + search real-time (Tavily) + affiliate injection berbasis relevansi (top-20 produk terakhir, bukan random) + UI produk afiliasi di review (badge relevansi, Ganti/Hapus).

## Key Files Changed

### Submodule
- `migrations/20260901000002_research_pipeline.sql` — 3 tabel (`content_research_sessions` 8-status enum, `content_research_topics`, `content_research_logs`) + extend `content_drafts` (`research_topic_id`, `affiliate_match_score`, `affiliate_match_signals`, `affiliate_swap_history`) + drop `one_injection` CHECK → `optional_injection` (<=1) + RPC `advance_research_stage` + RLS admin + cron: drop `process-content-requests`, create `asharu-content-research` (*/10) + `asharu-content-legacy` (*/5). Applied via MCP asharu + verified.

### Parent — backend
- `src/lib/research/search.ts` — `SearchProvider` interface + `TavilyProvider` (AbortController 20s timeout) + `getSearchProvider()` singleton.
- `src/lib/research/prompts.ts` — `buildDiscoveryPrompt` (spec user verbatim), `buildVerificationPrompt`, `buildScoringPrompt`, `DEFAULT_SCORING_WEIGHTS` (8 aspek, sum=1.0).
- `src/lib/research/state-machine.ts` — pure transitions + `canTransition`/`nextStage`/`isTerminal`.
- `src/lib/research/discovery.ts` — multi-query Tavily search (6-8 queries), dedup host+title, LLM synthesize, insert topics.
- `src/lib/research/verification.ts` — batch fact-check per topic, update verification_status.
- `src/lib/research/scoring.ts` — batch scoring, `computeFinalScore` (weighted − penalty, clamp 0-10).
- `src/lib/research/affiliate.ts` — `selectAffiliateProduct`: pool = 20 produk terbaru, score = 50 category match / 25 partial / 3 per keyword overlap (≥4 char), tiebreak recency; `relevanceBand` (high≥50/medium≥10/low/none).
- `src/lib/research/development.ts` — pick shortlisted topic → select affiliate → buildThreadPrompt → LLM → parse+validate → replace {{PRODUCT_URL}} → insert draft (research_topic_id, match score/signals, provider_id lookup).
- `src/lib/research/orchestrator.ts` — `advanceStage` (switch per status, `atomicTransition` = single UPDATE with `.eq('status', from)` guard — race-free, no recursion), `advancePendingSessions(limit, guardMs=5min)`.
- `src/lib/llm/completion.ts` — `runLLMCompletion` (provider fallback via KeyPool, default model lookup).
- `src/app/api/content/process/route.ts` — rewrite: auth Bearer + `advancePendingSessions(supabase, 5)`, maxDuration 300.
- `src/app/api/content/process-legacy/route.ts` — logic lama (content_requests → draft) dipindah utuh, maxDuration 60.
- `src/lib/env.ts` — `TAVILY_API_KEY` (Zod, prefix `tvly-`).
- `src/lib/content/actions.ts` — `createResearchSession` (insert sessions, splitCsv interests/categories, defaults 24h/12/6.0/3/3) + admin actions: `shortlistTopics`, `rejectTopics`, `advanceToDevelopment` (guard status awaiting_selection + ≥1 shortlisted), `swapAffiliateProduct` (re-score vs topic, swap_history cap 10), `removeAffiliateInjection` (injections=[], history append). Semua admin-guard via `assertAdmin()`.

### Parent — UI
- `src/app/[locale]/admin/riset/page.tsx` — list sessions + status badge.
- `src/app/[locale]/admin/riset/[sessionId]/page.tsx` — detail + topics list + drafts + actions.
- `src/app/[locale]/admin/riset/[sessionId]/topics/[topicId]/page.tsx` — topic full detail (hooks, facts, sources, breakdown).
- `src/components/admin/ResearchSessionActions.tsx` — client: checkbox shortlist/reject + advance, useTransition refresh.
- `src/components/content/AffiliateProductCard.tsx` — card produk + relevance badge + Ganti/Hapus + placeholder warning.
- `src/components/content/AffiliateProductPicker.tsx` — modal 20 produk terbaru + search filter.
- `src/components/content/ContentDraftCard.tsx` — render AffiliateProductCard + extended Draft interface.
- `src/components/content/ContentRequestForm.tsx` — collapsible "Pengaturan Riset Lanjutan" (11 field) + success → link `/admin/riset/[sessionId]`.
- routing pathnames `/admin/riset*`, nav `adminRiset`, i18n `admin.research.*` + `content.review.affiliate.*` (id+en), `LanguageSwitcher` cast fix.

### Tests (baru, +22)
- `state-machine.test.ts` (8), `affiliate.test.ts` (9), `scoring.test.ts` (5).

## Decisions
1. **Atomic UPDATE dengan status-guard** menggantikan RPC+SELECT+UPDATE (race-free; RPC `advance_research_stage` tetap ada di DB tapi tidak dipakai orchestrator — hanya stamp timestamp).
2. **Cron guard 5 menit** (bukan 60s) — discovery bisa 30-60s; mencegah double-fire.
3. **Affiliate = top-20 terbaru + scoring** (koreksi user), bukan random seluruh katalog.
4. **Constraint `optional_injection` (<=1)** — hapus produk diizinkan; placeholder warning di UI saat {{PRODUCT_URL}} tersisa tanpa produk.
5. **Legacy path dipertahankan**: `content_requests` + `/api/content/process-legacy` (cron 5m) — request lama tetap diproses.
6. **Swap product**: user pilih eksplisit dari picker; match_score dihitung ulang vs topic (bukan auto-pick).
7. **`request_id` di draft research = session id** (tanpa FK enforcement) — pragmatic; kolom `research_topic_id` yang jadi relasi resmi.

## Assumptions / Risks
- **Tavily belum di-provision**: `TAVILY_API_KEY` harus diset di Vercel + project harus punya credit. Tanpa key, `getSearchProvider()` throw → session `failed` dengan pesan jelas.
- **Prompt discovery panjang** (~2.5k token) + search context (25 hasil × 600 char) — biaya per session wajar tapi pantau.
- **Verification/scoring batch**: LLM bisa mengembalikan hasil tidak lengkap per index → mapping by index (best-effort).
- **Swap history** cap 10 (slice(-10)) — audit trail terbatas by design.
- **`advanceToDevelopment`** hanya transisi dari `awaiting_selection` — idempotent.
- **Belum E2E di production** — butuh: set TAVILY_API_KEY + CRON_SECRET setup P0 (masih pending) supaya cron research jalan.

## Blockers / Unresolved
- (Tetap) Setup P0 cron: seed Vault `asharu_cron_secret` + Vercel `CRON_SECRET` + apply `20260831000001` — **sekarang juga gate untuk pipeline riset** (cron research pakai secret yang sama).
- **TAVILY_API_KEY** belum diset di Vercel/Vault (user action).
- Iterasi `maximum_iterations` & `required_winners` tersimpan di session tapi **belum dipakai** di loop discovery (single-pass dulu) — future enhancement.
- `as never` casts pada Link dynamic (pragmatis, known).
- Sisa P2/P3 audit lain tetap open.

## Verification
- Gate hijau: lint ✓; tsc ✓; vitest 33 files / **199 tests** ✓ (+22); next build ✓ (route /admin/riset SSG + [sessionId] dynamic).
- DB live (MCP asharu): 3 tabel baru (21/19/6 cols), 4 kolom baru content_drafts, constraint `optional_injection (<=1)`, cron `asharu-content-research` (*/10) + `asharu-content-legacy` (*/5) active, `process-content-requests` dropped.
- Tests menemukan 2 bug nyata (all-zero fallback return null; relevanceBand(null) crash path) → fixed.

## Commit Proposal
- (submodule, pushed) `feat(db): research pipeline — 3 tables + RPC + content_drafts extend + cron reschedule` — `a0dbc1b`
- (parent, pushed) `feat(research): pipeline backend — search, 4 stage modules, processor rewrite` — `bca791e`
- (parent, pushed) `fix(research): atomic state transitions, refactor development, Tavily timeout` — `bc1f693`
- (parent, pushed) `feat(content): research form — extended fields + createResearchSession action` — `f85b13a`
- (parent, pushed) `feat(research): admin research pages, affiliate swap/remove UI, server actions` — `52e0824`
- (parent, pushed) `test(research): state-machine, affiliate scoring, weights — fix all-zero fallback + null relevance band` — `fa41254`
- (docs, akan commit) `docs: record content pipeline 4-stage in plan and memory`

## Related Plans
- `plans/2026-09-02-content-pipeline-4stage.md` (tasks diceklist).
- `plans/2026-09-01-admin-quick-wins.md` (PR sebelumnya; placeholder "Riset & Topik" di dashboard kini punya halaman asli).
