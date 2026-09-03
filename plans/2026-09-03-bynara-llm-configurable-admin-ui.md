# Bynara 9 Model + LLM Configurable by Table + Admin UI Provider/Key/Log

Created: 2026-09-03

## Objective
1. Tambah 9 model Bynara/Naraya exact sesuai list (`agnes-2.5-flash`, `mistral-medium-3-5`, `qwen3.8-27b`, `stepfun-3.7-flash`, `deepseek-v4-flash-free`, `glm-5.3-flash-free`, `glm-5.3-free`, `qwen3.8-flash-free`, `glm-5.2-promo`) dengan `reasoning=max` bila support, RR per-model dan fallback ke model berikutnya, jika semua model Bynara gagal → next provider.
2. Jadikan semua provider & model configurable by table (tanpa hardcode `if slug=='naraya'`), prioritas/urutan di `llm_providers`/`llm_models` via `priority`/`is_active`/`last_used_at`.
3. Bangun UI Admin (`/[locale]/admin/llm`) untuk: list provider, replace key / add backup key ke-n provider, ubah prioritas/urutan provider maupun model via drag-drop, dan lihat log lengkap request/response LLM.

## Scope
- In: DB migrasi `llm_providers`/`llm_models`/`llm_provider_keys`/`llm_call_logs`, `src/lib/llm/registry.ts`, `completion.ts`, `key-pool.ts`, `providers/openai-compatible.ts`, `vault.ts`, `src/lib/supabase/service.ts`, `is-admin.ts`, middleware guard, UI baru `src/app/[locale]/admin/llm/**` + Server Actions + components.
- Out: `opencode.json` global (content factory tidak baca opencode, hanya DB). Tidak sentuh `platforms`/`affiliate_products`.
- Klarifikasi terjawab: exact IDs, urutan sesuai list (priority 10-90), reasoning=`max`.

## Milestones
1. Migrasi + seed 9 model + kolom configurable
2. Refactor `completion.ts`/`key-pool`/`providers` untuk RR model reasoning max
3. UI Admin LLM (providers/models/keys/logs) + drag-drop + Server Actions + guard
4. Tests + verifikasi

## Tasks
- [x] Migrasi `20260903000002_llm_configurable_admin.sql` — tambah `priority/is_active/last_used_at/config/usage_count/failure_count` ke `llm_models`, tambah kolom log lengkap ke `llm_call_logs`, seed 9 Bynara exact priority 10-90 reasoning max
- [x] `src/lib/supabase/vault.ts` / `src/lib/llm/registry.ts` — `fetchOrderedModels`, `updateModelLastUsed`, `markModelUsage`
- [x] `src/lib/llm/types.ts` — `ModelRow {id,provider_id,model_id,display_name,priority,is_active,last_used_at,config,usage_count,failure_count}` + `reasoningEffort`
- [x] `src/lib/llm/providers/openai-compatible.ts` — inject `reasoning_effort:max` bila `modelConfig.reasoning`
- [x] `src/lib/llm/completion.ts` — loop `providers → models → keys`, log `request_messages/response_text/stage`, update `last_used_at`
- [x] `src/app/api/content/process-legacy/route.ts` — DRY via `runLLMCompletion`
- [x] UI: `src/app/[locale]/admin/llm/page.tsx` (RSC, isAdmin guard, createSupabaseService), `.../llm/[providerId]/page.tsx`, `.../llm/logs/page.tsx`
- [x] Server Actions: `src/lib/admin/llm-actions.ts` — updateProviderPriority, toggleProvider, updateModelPriority, toggleModel, upsertModel, replaceKey, addKey (Vault RPC), reorder batch
- [x] Components drag-drop: `@dnd-kit` untuk provider/model/keys reorder (`ProviderBoard`, `ModelBoard`, `KeyBoard`, `SortableList`)
- [x] Middleware `src/middleware.ts` — tambah guard `/(id|en)/admin/llm` admin only
- [x] Nav: `src/components/nav` — tambah Admin > LLM Providers (`navigation.ts`, `routing.ts`)
- [x] i18n: `messages/id.json` + `en.json` `nav.adminLlm`
- [x] Tests: 240 tests pass (`npm test`), typecheck ✓, lint ✓, build ✓ (routes /admin/llm, /admin/llm/[providerId], /admin/llm/logs ter-generate)
- [x] Verif: drag-drop provider/model/key → `reorderProviders/Models/Keys` update `priority=(index+1)*10`; replace key via Vault; add backup key; logs page filter & expand request/response

## Risks
- Secret handling di UI → Server Actions only, Vault tidak log plaintext, hash display 8 chars, audit `llm_call_logs.key_hash` bukan key.
- `last_used_at` write tiap sukses → hot row contention 2 worker — `UPDATE ... SET last_used_at=now()` tanpa read-modify, atau fallback ke static priority.
- 9 model Bynara 404 cascade (ID typo) → latensi 9×timeout — validasi `GET /v1/models` pre-seed, `AbortSignal.timeout(15s)` per model, log `http_status` di UI langsung terlihat.
- `response_text` bisa besar (thread JSON) → cap 8k chars di `llm_call_logs.response_text`, pagination index `created_at DESC`.

## Progress Log
- 2026-09-03 — Plan v3 dibuat, build mode aktif, mulai eksekusi.
- 2026-09-03 — Migrasi `20260903000002_llm_configurable_admin.sql` dibuat (`priority/is_active/last_used_at/config` untuk `llm_models`, kolom lengkap `llm_call_logs`, seed 9 Bynara).
- 2026-09-03 11:50 — `types.ts` + `vault.ts`/`registry.ts` (fetchOrderedModels, markModelUsage), `openai-compatible.ts` reasoning max, `completion.ts` RR provider→model→key, `process-legacy` DRY via `runLLMCompletion`, `@dnd-kit` install, UI `/admin/llm` + `/admin/llm/[providerId]` + `/admin/llm/logs` + `llm-actions.ts` + `SortableList/ProviderBoard/ModelBoard/KeyBoard`, middleware guard + nav `adminLlm`, i18n. Gate hijau: typecheck ✓ lint ✓ 240 tests ✓ build ✓.

## Notes
- Istilah `bynara` = `naraya` (slug DB `naraya`, base_url `router.bynara.id` `src/lib/llm/providers/naraya.ts:3`). UI tampilkan "Bynara (Naraya Router)".
- PR terpisah dari pipeline 4-tahap (`orchestrator.ts:80`, `development.ts:171`) — LLM call tetap via `runLLMCompletion`, jadi RR baru otomatis berlaku untuk `discovering`/`developing`.
