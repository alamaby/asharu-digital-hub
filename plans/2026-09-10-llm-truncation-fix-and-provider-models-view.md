# LLM Truncation Fix + Provider-Models View

Created: 2026-09-10 11:20:00

## Objective
Atasi log Gemini HTTP 200 yang terpotong + buat view gabungan provider→model. Keputusan user: (1) effort reasoning stage kecil → low, (2) tambah kolom audit, (3) apply migrasi langsung via MCP.

## Scope
- `src/lib/llm/providers/gemini.ts`, `src/lib/llm/completion.ts`, `src/lib/llm/types.ts`, `src/lib/llm/model-config.ts` (+test)
- Migrasi `supabase/migrations/20260910000002_llm_logs_truncation_audit_view.sql` (applied prod via MCP)

## Milestones
1. Diagnosis via MCP read-only selesai
2. Fix kode + test hijau
3. Migrasi applied + view terverifikasi

## Tasks
- [x] Diagnosis: 2 mekanisme (thinking HIGH × maxTokens kecil → MAX_TOKENS; slice 8000 → preview log); finishReason tak pernah dicatat; 503 3.8-flash transien
- [x] `gemini.ts`: parse finishReason + gabung semua parts + thoughtTokens + rawPreview forensik
- [x] `model-config.ts`: `capEffortForStage` (6 stage kecil → low) + `isLengthCutoff` + test (8 test baru)
- [x] `completion.ts`: cap di 3 jalur (waterfall/pinned/hint); MAX_TOKENS = failure → lanjut waterfall; log `response_truncated` + `thought_tokens`
- [x] Migrasi: `response_truncated bool`, `thought_tokens int`, index parsial, view `v_llm_provider_models` (security_invoker, tanpa secret) + GRANT authenticated; applied prod via MCP + terverifikasi SELECT
- [x] Gate: typecheck/lint/361 tests hijau; security advisor tanpa temuan baru

## Risks
- MAX_TOKENS kini failure → pemakaian model cadangan bertambah saat developing mentok 3200 (diterima: parsial tak bisa di-parse juga).
- Baris lama `response_truncated=false` default (audit mulai kode baru); `terpotong_7h=0` sampai ada traffic baru.
- View subquery 7 hari murah di 311 log; revisi bila >100k.

## Progress Log
- 2026-09-10 11:20:00 — SELESAI. Kode + migrasi applied prod (`success:true`) + view verified. Submodule commit dulu lalu parent (aturan repo).

## Notes
- C2M/TM Forum tidak relevan (observabilitas LLM internal, tanpa perubahan skema bisnis).
- Perilaku berubah: output terpotong tidak lagi "sukses diam-diam" (failure_count kini naik saat MAX_TOKENS — pantau via view).
