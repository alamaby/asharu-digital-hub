# LLM Truncation Fix + View Provider-Models

Tanggal: 2026-09-10 11:25 (local). Plan: `plans/2026-09-10-llm-truncation-fix-and-provider-models-view.md`. Keputusan user: effort stage kecil → low; tambah kolom audit; apply migrasi langsung via MCP.

## Diagnosis (MCP read-only, 7 hari terakhir)
- 228 log gemini HTTP 200: 12 genuinely terpotong tengah JSON (idea_generation/image_prompt, completion 10–36 token, budget 500–900), sisanya "terpotong" = slice preview log 8000 (`completion.ts`, developing/verifying len≈8000, output model sehat).
- Akar: semua model Gemini `config={reasoning,max}` (resync pagi ini `...00001`) → `thinkingLevel HIGH` selalu dikirim → thinking habiskan maxOutputTokens kecil → MAX_TOKENS.
- Blind spot: `gemini.ts` tak parse `finishReason` (NULL di semua baris) + hanya baca `parts[0]`; output pendek lolos empty-guard → "sukses diam-diam", `failure_count` 0, parse gagal di hilir.
- 503 3.7/3.8-flash = kapasitas transien, waterfall sudah cover.

## File diubah
- `src/lib/llm/providers/gemini.ts`: parse `finishReason`, gabung semua part non-thought, `thoughtTokens` (thoughtsTokenCount), `rawPreview` forensik dari part thought.
- `src/lib/llm/model-config.ts`: `LOW_EFFORT_STAGES` (idea/image/enhance/scoring/verifying/regen) + `capEffortForStage` + `isLengthCutoff` (murni, ditest).
- `src/lib/llm/completion.ts`: cap di 3 jalur (waterfall/pinned/hint); MAX_TOKENS/LENGTH = failure (log + markModelFailure + lanjut waterfall); semua insert sukses log `response_truncated` + `thought_tokens`.
- `src/lib/llm/types.ts`: `ChatOutput.thoughtTokens`.
- `src/lib/llm/model-config.test.ts`: +8 test (cap, cutoff, mapping LOW).
- `supabase/migrations/20260910000002_llm_logs_truncation_audit_view.sql`: `response_truncated bool`, `thought_tokens int`, index parsial, view `v_llm_provider_models` (security_invoker, tanpa secret) + GRANT authenticated. Applied prod via MCP `success:true`, view verified (42 model, urutan + stat 7h benar, `terpotong_7h=0` sampai traffic baru).

## Keputusan / trade-off
- Cap di kode (bukan UPDATE config): config per-model dipakai bersama developing/discovery yang butuh HIGH; stage kecil dapat LOW tanpa turunkan kualitas thread.
- MAX_TOKENS kini failure → pemakaian cadangan naik saat developing mentok 3200 (diterima; parsial tak ter-parse juga). Pantau `failure_count` via view.
- Baris lama `response_truncated=false` default; tanpa backfill (heuristik btrim berisiko false-positive newline).
- View subquery 7h murah di 311 log; revisi bila >100k.

## Verifikasi
- `typecheck` ✓, `lint` ✓, `npm test` 361/361 (47 files) ✓.
- Security advisor: hanya temuan pre-existing (search_path, SECURITY DEFINER RPC, leaked-pw) — tak terkait perubahan.
- Belum: QA traffic nyata (tunggu cron/generate ide → cek `finish_reason=STOP`, `thought_tokens` terisi).

## Commit
- submodule: `feat(db): audit keterpotongan llm + view provider-models`
- parent: `fix(llm): tangkap finishReason + cap effort stage kecil + view provider-models`
