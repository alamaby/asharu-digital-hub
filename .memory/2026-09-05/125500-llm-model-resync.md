# LLM Model Resync Bynara + OpenRouter

Date: 2026-09-05 ~12:55 (local time)

## Task
Sesuaikan `llm_models`: 7 model Bynara (slug `naraya`) + 9 model OpenRouter aktif sesuai list user; semua di luar list di-disable (`is_active=false`, non-destruktif).

## Key files changed
- `supabase/migrations/20260905000004_llm_models_resync.sql` (baru, applied production sebagai `llm_models_resync`) — upsert 7 naraya (priority 10–70, reasoning max semua) + upsert 9 openrouter (priority 10–90, reasoning max hanya nano-reasoning) + 2 UPDATE disable.
- `plans/2026-09-05-llm-model-resync-bynara-openrouter.md` (baru) — plan file per §7 AGENTS.md.
- `src/lib/research/discovery.ts:250` — `let allTopics` → `const` (fix lint pre-existing dari commit `cbb20ec`; hanya mutasi via `push`, bukan reassign).

## Decisions
- ID dipakai as-is sesuai konfirmasi user (termasuk `laguna-s-2.1`, `longcat-2.0-free`, `muse-spark-1.2-contributor-free`); belum tervalidasi ke `GET /v1/models`.
- Priority = urutan tulis user. Reasoning max: semua 7 naraya + `nemotron-3-nano-reasoning` openrouter.
- Disable via `is_active=false` (bukan DELETE) — histori `llm_call_logs` + FK `llm_stage_defaults`/`content_research_sessions` aman.
- Tidak ada perubahan kode runtime/UI — sudah DB-driven (`fetchOrderedModels` filter `is_active`, `resolveStageModel` tolak nonaktif).

## Assumptions / risks
- Asumsi: model `:free` OpenRouter + ID as-is valid di router masing-masing. Risiko 404/rate-limit → fallback berlapis (`completion.ts`) + pantau `/admin/llm/logs`.
- `failure_count>5 → is_active=false` permanen bisa menonaktifkan model baru — pantau via admin UI.

## Verification
- SELECT production: 7 naraya aktif (10–70, reasoning max), 9 openrouter aktif (10–90), sisanya nonaktif (mistral, deepseek, glm-*, qwen-flash-free, nemotron lama, gpt-4o-mini).
- `llm_stage_defaults` semua NULL → global waterfall, aman.
- Gate: `npm test` 263 ✓, `typecheck` ✓, `lint` ✓, `next build` ✓ (50/50 pages).

## Commit proposal
`feat(llm): resync models to 7 bynara plus 9 openrouter, disable rest`

## Related
- Plan: `plans/2026-09-05-llm-model-resync-bynara-openrouter.md`
- Prior: `plans/2026-09-03-bynara-llm-configurable-admin-ui.md`, migrasi `20260903000002_llm_configurable_admin.sql`
