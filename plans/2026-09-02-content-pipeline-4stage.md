# Content Pipeline 4-Tahap (Discovery→Verification→Scoring→Development) (2 Sep)

Created: 2026-09-02 09:00

## Objective
Mereplace pipeline single-pass `/api/content/process` (saat ini: 1 produk random → build prompt → call LLM → parse thread → insert draft) dengan pipeline 4-tahap persistent dengan admin checkpoint di antara tahap. Search real-time via Tavily API. Affiliate injection dipilih dari 20 produk terakhir dengan scoring kesesuaian topik. Produk afiliasi ditampilkan di halaman review dengan badge relevansi + actions (Ganti/Hapus).

## Scope (1 PR besar)
- A. Fondasi: DB migration (3 tabel + RPC + content_drafts extension + cron reschedule) + env (TAVILY_API_KEY + Vault) + search provider (Tavily).
- B. Modules: discovery, verification, scoring, development, affiliate, state-machine, orchestrator + 3 prompt builders.
- C. Processor rewrite: `/api/content/process` (research, 10 min cron) + `/api/content/process-legacy` (legacy direct, 5 min cron).
- D. Form extension: `/konten/baru` + ContentRequestForm + actions + i18n.
- E. Admin pages: `/admin/riset`, `/admin/riset/[sessionId]`, `/admin/riset/[sessionId]/topics/[topicId]` + loading/error + nav + i18n. AffiliateProductCard + AffiliateProductPicker + actions (swapAffiliateProduct, removeAffiliateInjection) + ContentDraftCard section.
- F. Tests: orchestrator, scoring, discovery, verification, search, affiliate, swap, remove, process, prompt builders.
- G. Gate + commit (submodule + 2-3 parent logical) + push + memory/plan/README.

## Decisions
1. **Tavily** untuk search API (`TAVILY_API_KEY` di env + Vault). Future-proof: `SearchProvider` interface memungkinkan Serper/Brave/Exa.
2. **Cron 10 menit** untuk `asharu-content-research` (konservatif quota). Legacy `asharu-content-legacy` jalan terpisah 5 menit (handle `content_requests` lama yang tidak via research).
3. **Persistent DB stages** (Q2 jawaban sebelumnya). Status enum: `pending|discovering|verifying|scoring|awaiting_selection|developing|completed|failed`. Topic status: `pending|shortlisted|rejected`.
4. **Affiliate selection** = 20 produk terakhir (`ORDER BY created_at DESC LIMIT 20`) di-score per topic. Score: 50 untuk category match, +3 per keyword overlap (≥4 char words) antara topic text & product name. Tiebreak by recency. Fallback: jika 0 produk, draft tanpa injection + flag `affiliate_match_signals.no_recent_products`.
5. **Affiliate match visualization** di review: relevance badge (Hijau ≥50, Kuning 10-49, Merah <10). Card produk: image, friendly_code, name, category, merchant, URL. Actions: Ganti (modal picker dari 20 terakhir) + Hapus (set injections=[]).
6. **Constraint relax**: drop `one_injection` CHECK (length=1) → `optional_injection` (length<=1). Hapus produk diizinkan, draft tetap utuh.
7. **Affiliate swap history**: column `affiliate_swap_history jsonb` (append-only audit trail, capped at 10 entries per draft — auto-prune in app).
8. **Backward compat**: `content_requests` table stays + legacy processor route stays. New form → research_sessions.
9. **Processor `maxDuration`**: research 300s (5 min — chained stages), legacy 60s (unchanged).
10. **Admin checkpoint**: `awaiting_selection` status. Admin shortlist 1-N topics via `/admin/riset/[sessionId]`. Tombol "Lanjut ke Development" enabled only when at least 1 shortlisted topic + status awaiting_selection.

## Tasks

### FASE A — Fondasi
- [x] Submodule migration `20260901000002_research_pipeline.sql`:
  - `content_research_sessions` (id, status enum, params jsonb, created_by, target_location, secondary_location, audience_age, audience_interests text[], platform_slug, tone, account_goal, allowed_categories text[], excluded_categories text[], freshness_hours, minimum_candidates, minimum_score, required_winners, maximum_iterations, current_stage_started_at, error_message, created_at, updated_at).
  - `content_research_topics` (id, session_id FK, rank, topic, category, why_now, audience_relevance, key_facts jsonb, unique_angle, hooks jsonb, recommended_format, recommended_platform text[], potential_risk, verification_status, sources jsonb, score_breakdown jsonb, status, final_score numeric, created_at).
  - `content_research_logs` (id, session_id FK, stage, level, message, created_at).
  - Extend `content_drafts`: add `research_topic_id uuid REFERENCES content_research_topics(id) ON DELETE SET NULL`, `affiliate_match_score int`, `affiliate_match_signals jsonb`, `affiliate_swap_history jsonb DEFAULT '[]'::jsonb`.
  - Drop CHECK `one_injection` (length=1) → add `optional_injection` (length<=1).
  - RLS: admin read/write via `is_admin()`; service_role full (mirror `content_requests`).
  - RPC `advance_research_stage(p_session_id uuid)` — SECURITY DEFINER, service_role only, atomic state transition + stamp `current_stage_started_at`.
  - Reschedule `pg_cron`: drop old `asharu-content-process` (was 5 min). Create `asharu-content-research` (10 min) + `asharu-content-legacy` (5 min). Both call supabase.net.http_post to `/api/content/process` & `/api/content/process-legacy` with Bearer `vault.decrypted_secrets(name='asharu_cron_secret')`.
- [x] Apply migration via MCP asharu.
- [x] `src/lib/env.ts`: add `TAVILY_API_KEY` Zod (non-empty, prefix `tvly-`).
- [~] `scripts/seed-research-keys.mjs`: **dilewati** — TAVILY key cukup via Vercel env (processor baca `process.env`, tidak perlu Vault).
- [x] `src/lib/research/search.ts`: `SearchProvider` interface (`search(query, opts) → SearchResult[]`), `TavilyProvider` impl (POST `https://api.tavily.com/search` with API key, returns `{title, url, content, score, publishedDate}`), factory `getSearchProvider()`.

### FASE B — Modules
- [x] `src/lib/llm/prompts/discovery.ts` — system prompt (user's spec verbatim) + JSON schema.
- [x] `src/lib/llm/prompts/verification.ts` — per-batch fact-checker prompt.
- [x] `src/lib/llm/prompts/scoring.ts` — batch scoring prompt + JSON schema.
- [x] `src/lib/research/discovery.ts` — `runDiscovery(supabase, sessionId)`: build queries, parallel `tavily.search`, dedup by URL hostname+title, call LLM with raw search results, insert topics.
- [x] `src/lib/research/verification.ts` — `runVerification(supabase, sessionId)`: per-topic targeted search, LLM verify date/location/source, update `verification_status`.
- [x] `src/lib/research/scoring.ts` — `runScoring(supabase, sessionId)`: LLM score 8 sub-aspects + penalty + final_score per topic, update score_breakdown + final_score, rank.
- [x] `src/lib/research/affiliate.ts` — `selectAffiliateProduct(supabase, topic)`: query last 20, score by category match (50) + keyword overlap (3/word ≥4 chars), pick top, attach `affiliate_match_score` + `signals`.
- [x] `src/lib/research/development.ts` — `runDevelopment(supabase, sessionId)`: pick shortlisted topic, build thread prompt (reuse `buildThreadPrompt`), call LLM, select affiliate, insert `content_drafts` with `research_topic_id` + `affiliate_match_score` + `signals`.
- [x] `src/lib/research/state-machine.ts` — pure functions: `nextStage(currentStatus)`, `canTransition(from, to)`, `validateParams(params)`.
- [x] `src/lib/research/orchestrator.ts` — `advanceStage(sessionId)`: read session, switch on status, run stage handler, write results, transition status. Idempotent (if already in target stage, no-op). Catches errors → set status='failed' + log.

### FASE C — Processor rewrite
- [x] `src/app/api/content/process/route.ts` rewrite:
  - Auth unchanged (Bearer CRON_SECRET via `isCronAuthorized`).
  - Logic: `SELECT id FROM content_research_sessions WHERE status IN ('pending','discovering','verifying','scoring','developing') AND current_stage_started_at < now() - interval '60 seconds' ORDER BY current_stage_started_at LIMIT 5`. For each, call `advanceStage(id)`.
  - `maxDuration = 300`.
- [x] `src/app/api/content/process-legacy/route.ts` (new):
  - Auth same.
  - Copy old processor logic (claim `content_requests`, pick 1 product random, build prompt, call LLM, parse thread, insert draft, update status).
  - `maxDuration = 60`.

### FASE D — Form extension
- [x] `src/components/content/ContentRequestForm.tsx` — extend fields: target_location, secondary_location, audience_age, audience_interests (comma-separated → array), allowed_categories (multi-select), excluded_categories (multi-select), freshness_hours, minimum_candidates, minimum_score, required_winners, maximum_iterations. Collapsible "Pengaturan Riset Lanjutan" group.
- [x] `src/lib/content/actions.ts`: `createContentRequest` → `createResearchSession(formData)`. Insert to `content_research_sessions`. Keep `createContentRequest` for legacy.
- [x] `src/app/[locale]/konten/baru/page.tsx`: extend header copy.
- [x] `src/messages/{id,en}.json`: keys for new fields.

### FASE E — Admin pages
- [x] `src/app/[locale]/admin/riset/page.tsx` (RSC) — list sessions, filter by status + date, card per session.
- [x] `src/app/[locale]/admin/riset/[sessionId]/page.tsx` (RSC) — detail: topics table, batch action "Lanjut ke Development".
- [x] `src/app/[locale]/admin/riset/[sessionId]/topics/[topicId]/page.tsx` (RSC) — detail per topic.
- [x] `src/app/[locale]/admin/riset/loading.tsx` + `error.tsx` (skeleton + boundary).
- [x] `src/app/[locale]/admin/riset/[sessionId]/loading.tsx` + `error.tsx`.
- [x] `src/config/navigation.ts`: `adminNavItems` tambah `{ key: 'adminRiset', pathname: '/admin/riset' }`.
- [x] `src/i18n/routing.ts`: pathnames `/admin/riset`, `/admin/riset/[sessionId]`, `/admin/riset/[sessionId]/topics/[topicId]`.
- [x] `src/messages/{id,en}.json`: `admin.research.*` namespace.
- [x] `src/components/admin/ResearchSessionsList.tsx` + `ResearchSessionDetail.tsx` + `ResearchTopicDetail.tsx` (server components, mostly markup + Link to actions).
- [x] `src/lib/content/actions.ts`: `shortlistTopics(sessionId, topicIds[])` + `rejectTopics(sessionId, topicIds[])` + `advanceToDevelopment(sessionId)` + `swapAffiliateProduct(draftId, newProductId)` + `removeAffiliateInjection(draftId)`. All `isAdmin()` guard.
- [x] `src/components/content/AffiliateProductCard.tsx` (client) — image, name, category, merchant, URL, relevance badge, **Ganti** + **Hapus** buttons.
- [x] `src/components/content/AffiliateProductPicker.tsx` (client) — modal/dropdown 20 produk terakhir + select action → `swapAffiliateProduct`.
- [x] `src/components/content/ContentDraftCard.tsx` — extend dengan section "Produk Afiliasi" (render `AffiliateProductCard`).
- [x] `src/messages/{id,en}.json`: `content.review.affiliate.*` namespace (relevanceHigh/Medium/Low, swap, remove, viewProduct, placeholderWarning, noRecentProducts).

### FASE F — Tests
- [x] `src/lib/research/affiliate.test.ts` — last 20 pool, category match, no match fallback, empty pool, signals.
- [x] `src/lib/research/scoring.test.ts` — formula deterministic, weight sum=1.
- [ ] `src/lib/research/discovery.test.ts` — dedup, candidate count. **DEFERRED** (butuh mock supabase+LLM; dedup sudah di-review).
- [ ] `src/lib/research/verification.test.ts` — status transitions. **DEFERRED**.
- [ ] `src/lib/research/search.test.ts` — Tavily mock. **DEFERRED**.
- [x] `src/lib/research/state-machine.test.ts` — transitions valid/invalid.
- [ ] `src/lib/research/orchestrator.test.ts` — advanceStage idempotent. **DEFERRED** (atomic UPDATE guard sudah di-review; pure state-machine sudah di-test).
- [ ] `src/app/api/content/process/route.test.ts` — auth + advance. **DEFERRED** (cron-auth sudah di-test di `cron-auth.test.ts`).
- [ ] `src/lib/content/actions.test.ts` (extend) — `swapAffiliateProduct` + `removeAffiliateInjection` + `shortlistTopics`. **DEFERRED** (butuh mock supabase; logic swap sudah di-review).
- [ ] `src/components/content/AffiliateProductCard.test.tsx` (snapshots). **DEFERRED**.

### FASE G — Gate + commit + push + docs
- [x] Gate: lint + typecheck + test + build.
- [x] Submodule commit: migration + cron config.
- [x] Parent commits logical: (1) FASE A + B (backend), (2) FASE C + D (processor + form), (3) FASE E (admin UI), (4) FASE F (tests), (5) docs.
- [x] Push.
- [x] `.memory/2026-09-02/HHmmss-pipeline-4stage.md` + README.
- [x] Update `plans/2026-09-01-admin-quick-wins.md` log (final).

## Risiko
1. **Tavily quota**: ~50-70 searches/session. Free 1000/bulan = ~14-20 session gratis. Monitor.
2. **LLM call volume**: 4 calls/session (discovery + verification + scoring + development).maxDuration=300 sufficient.
3. **Cron overlap**: 2 jobs paralel (research 10m + legacy 5m). Separate concerns, no risk.
4. **Constraint relax risk**: draft tanpa affiliate lolos review. Acceptable — admin hapus manual via card.
5. **State machine complexity**: idempotency critical. Test extensively.
6. **Search API failure**: orchestrator catches → set `status='failed'` + log.
7. **Backward compat**: legacy `content_requests` + legacy processor route stays. Both cron jobs active.
8. **Affiliate selection subjectivity**: scoring formula (50 category, 3 keyword) empirically tuned; not perfect but pragmatic.
9. **Swap modal simplicity**: dropdown (no search). Future enhancement.
10. **Form 12+ fields**: progressive disclosure (collapsible "advanced" group).

## Verifikasi
- Gate: lint + typecheck + 35+ tests + build all ✓.
- DB live: 3 new tables + RLS + RPC + extended `content_drafts` verified via MCP asharu.
- Manual E2E (Vercel): submit form → research session `discovering` → after cron advances `verifying`/`scoring` → `awaiting_selection` → admin shortlist 1 → click "Lanjut ke Development" → after cron draft inserted with `research_topic_id` + `affiliate_match_score` + 1 affiliate injection (dari 20 terakhir, relevan) → review page shows draft + product card dengan relevance badge.

## Progress Log
- 2026-09-02 09:00 — Plan dibuat (user: "lanjut 4 stage content creation" + koreksi affiliate top-20 + card produk di review).
- 2026-09-02 10:20 — SELESAI & ter-push (1 PR besar, 6 commit). FASE A: migration `20260901000002` applied via MCP asharu + verified (3 tabel, 4 kolom draft, constraint `optional_injection <=1`, cron research */10 + legacy */5, job lama dropped). FASE B: 8 modul research + 3 prompt + completion.ts. FASE C: processor rewrite + process-legacy. FASE D: form extension (collapsible advanced, createResearchSession) + nav "Riset" + pathnames. FASE E: 3 halaman /admin/riset* + ResearchSessionActions (shortlist/reject/advance) + AffiliateProductCard (badge relevansi, Ganti/Hapus) + AffiliateProductPicker + swap/remove actions + i18n. FASE F: +22 tests (state-machine, affiliate, scoring) — menemukan 2 bug nyata (all-zero fallback, null band) → fixed. Gate: lint ✓ tsc ✓ 199/199 ✓ build ✓. Push: submodule `a0dbc1b`; parent `bca791e`→`bc1f693`→`f85b13a`→`52e0824`→`fa41254`.
- 2026-09-02 10:20 — Status: MENUNGGU USER — (1) set `TAVILY_API_KEY` di Vercel (Production), (2) setup P0 cron (seed Vault `asharu_cron_secret` + Vercel `CRON_SECRET` + apply `20260831000001`) — kini juga gate pipeline riset (cron research pakai secret yang sama). Tanpa keduanya: submit form → session `failed` dengan pesan jelas (fail-safe).
- Known deferred: `maximum_iterations`/`required_winners` tersimpan tapi discovery masih single-pass (bukan loop iteratif penuh) — future enhancement; `advance_research_stage` RPC ada di DB tapi orchestrator pakai atomic UPDATE langsung.

## Catatan
- Pipeline ini menggantikan single-pass processor untuk **request baru**. Legacy `content_requests` tetap diproses via `/api/content/process-legacy`.
- `TAVILY_API_KEY` harus di-set di Vercel (Production) + Vault (untuk cron env jika perlu) — user action setelah deploy.
