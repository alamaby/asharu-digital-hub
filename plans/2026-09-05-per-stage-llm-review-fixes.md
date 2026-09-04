# Per-Stage LLM Review Fixes (2026-09-05)

Created: 2026-09-05 10:00
Base commit: a1a00f1 (chore db bump) / 1709f91 (feat research,llm)

## Objective
Perbaiki temuan review ketat pasca `feat(research,llm): per-stage provider->model picker` (22 files, 682 ins). Fokus: keamanan, kebenaran fallback waterfall, RLS, dan kebocoran model nonaktif. Semua perbaikan non-destructive, tidak mengubah kontrak API publik.

## Scope
- Migration follow-up `20260905000002_stage_llm_review_fixes.sql` (nullable session_id guard alternative, ON DELETE SET NULL updated_by, index, CHECK for _model_id RLS)
- Core LLM: completion.ts, registry.ts, stage-defaults.ts, types.ts
- Actions: content/actions.ts (generateIdea gate + honeypot)
- Research: orchestrator.ts, discovery/verification/scoring/development.ts
- Frontend: StageModelPicker a11y, AffiliateProductCard reset, admin/stages updated_by
- Verifikasi: `npm run build` + `npm run lint` + manual admin/non-admin test

## Out of scope
- Mengubah RLS content_drafts browser update ke server action (P0-07) — defer; verifikasi policy existing saja.
- Preset Hemat/Cepat/Akurat — fase 2.
- Realtime log streaming.

## Findings (ringkas, dari review explore)

### P0 Blocker
- P0-01 content_research_logs FK violation saat sessionId=null (idea_generation) — warn hilang diam-diam karena .then swallow
- P0-02 Pinned path bocorkan model disabled (is_active tidak difilter) di completion.ts, stage-defaults.ts, 4 research stages
- P0-03 resolveStageModel return default disabled tanpa re-validasi
- P0-04 generateIdea izinkan non-admin pin model (tanpa isAdmin gate) — probe deterministik
- P0-06 getServiceClient bisa return null → TypeError di cron/orchestrator
- P0-08 regen draft tulis provider_id/model_id tanpa guard FK (tipe campur)

### P1 Important
- P1-01 reasoningEffort tidak diteruskan di modelHint path
- P1-04 tryPinnedModelHint loop semua provider → latensi blow-up (4×2 keys, timeout 60s)
- P1-05 providerId mismatch silent (log generik)
- P1-07 honeypot tidak dicek di generateIdea (bots hammer 30/jam)
- P1-08 RLS _model_id: anon bisa POST langsung ke Supabase REST jika RLS insert longgar
- P1-11 orchestrator select('*') over-fetch & type brittleness
- P1-16 updated_by tidak pernah diisi
- P1-20 ON DELETE SET NULL untuk updated_by hilang → hapus admin gagal FK
- P1-14 regen state tidak reset setelah refresh
- P1-13 a11y label tanpa htmlFor/id

### P2 Suggestion (defer sebagian)
- P2-02 index tambahan, P2-05 fallback model hardcoded, P2-06 reasoning medium/low, P2-14 updated_at trigger, dll.

## Tasks

- [ ] M1 Migration follow-up `20260905000002_stage_llm_review_fixes.sql`
  - [ ] `llm_stage_defaults.updated_by` → `ON DELETE SET NULL`, index `idx_stage_defaults_provider`, `idx_stage_defaults_model`, `idx_drafts_last_regen_model` sudah ada, tambah `idx_stage_defaults_updated_by`
  - [ ] `CHECK`/`RLS` untuk _model_id: `WITH CHECK (is_admin() OR (_model_id IS NULL ...))` atau trigger; minimal tambah `COMMENT` + RLS policy update
  - [ ] `content_research_logs.session_id` tetap NOT NULL — dokumentasikan guard di app (tidak diubah)
  - [ ] `updated_at` trigger untuk llm_stage_defaults (opsional, manual set tetap)

- [ ] M2 Core LLM
  - [ ] `completion.ts:62-84` — guard `if (input.sessionId)` sebelum insert content_research_logs warn; else `console.warn`
  - [ ] `completion.ts:tryPinnedModel` — `.eq('is_active',true)` + treat not found as fallback
  - [ ] `completion.ts:tryPinnedModelHint` — query `llm_models where model_id=hint limit 1` untuk single provider, resolve reasoningEffort, markModelUsage
  - [ ] `completion.ts:providerId mismatch` — log distinct warn message
  - [ ] `stage-defaults.ts` — semua SELECT tambah `is_active=true`, `getStageDefault` re-validate, null guard untuk service client
  - [ ] `registry.ts` — guard null service client, listAllActiveModels sudah, keep
  - [ ] `types.ts` — no change (defer P2-03)

- [ ] M3 Actions
  - [ ] `actions.ts:generateIdea` — gate `isAdmin()` untuk ideaGenerationModelId, honeypot check `website`
  - [ ] `actions.ts:createResearchSession` — sudah gate, keep; tambah `void` catch comment fix

- [ ] M4 Research wiring
  - [ ] `discovery/verification/scoring/development.ts` — sebelum pakai pinnedModelId, cek `is_active=true` else fallback global
  - [ ] `orchestrator.ts:113` — ganti `select('*')` ke daftar kolom eksplisit termasuk 5 *_model_id
  - [ ] `development.ts:generateAndInsertDraft` — sudah terima pinnedModelId, keep

- [ ] M5 Frontend
  - [ ] `StageModelPicker.tsx` — pakai `stage` prop untuk `id`/`htmlFor`, a11y fix
  - [ ] `AffiliateProductCard.tsx` — reset regenProviderId/ModelId setelah sukses, a11y htmlFor/id untuk regen selects
  - [ ] `admin/llm/stages/page.tsx` — isi `updated_by` via `auth.getUser()`, service null throw, htmlFor/id
  - [ ] `ContentRequestForm.tsx` — `regen_affiliate` info already disabled, keep

- [ ] M6 QA
  - [ ] `npm run build` (harus hijau), `npm run lint` (harus hijau, no prefer-const, no empty catch)
  - [ ] Manual: anon POST dengan modelId → 403/validation, admin POST sukses, disable model → fallback global terlihat di warn log
  - [ ] Commit + push (parent + submodule)

## Risks
- Migration CHECK RLS untuk _model_id bisa blokir insert anon legacy — mitigasi: CHECK hanya `is_admin() OR all null`, test insert anon tanpa modelId tetap lolos.
- Single-provider hint query bisa salah jika duplicate model_id across provider — mitigasi: prefix `provider/model` atau ambil first active.

## Progress Log
- 2026-09-05 10:00 — Plan dibuat setelah review explore (P0×6, P1×10). Belum eksekusi.
- 2026-09-05 11:30 — Fix SELESAI. Migration `20260905000002_stage_llm_review_fixes.sql` (FK ON DELETE SET NULL updated_by, TRIGGER touch_updated_at, indexes). Core: completion.ts guard sessionId null (P0-01), is_active di pinned (P0-02), mismatch warn (P1-05), tryPinnedModelHint single-provider + reasoning + mark usage (P1-01/04). stage-defaults re-validate is_active (P0-02/03) + null guard (P0-06). registry null guard (P0-06). actions generateIdea honeypot + admin gate (P0-04/P1-07). research 4 stages is_active + orchestrator explicit select (P1-11). Frontend StageModelPicker htmlFor/id, AffiliateProductCard regen reset + a11y, stages page updated_by + throw. Build ✓ Lint ✓.
