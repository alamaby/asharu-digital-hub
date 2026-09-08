# Enhance image prompt side-by-side (cover & per-reply)

Created: 2026-09-08 03:50:00

## Objective
User yang sudah ada draf prompt (≥10 char) di review bisa Enhance (polish prompt+negative via LLM `enhance_image_prompt`) lalu lihat side-by-side (draf vs usulan) dan Terima/Batal sebelum Regenerate. Stage baru dengan picker Admin→LLM, limit 30/jam admin-bypass.

## Scope
- `supabase/migrations/20260908000001_enhance_image_prompt_stage.sql`
- `src/lib/llm/types.ts` `LLMStage`
- `src/lib/image/prompt.ts` `buildEnhancePromptMessages`
- `src/lib/image/actions.ts` `enhanceImagePrompt`
- `src/components/content/DraftImageCard.tsx` cover enhance
- `src/components/content/PostImageControl.tsx` per-reply enhance
- `src/lib/admin/llm-actions.ts` valid stages
- `src/app/[locale]/admin/llm/stages/page.tsx` labels

## Tasks
- [x] T1 Migrasi `20260908000001_enhance_image_prompt_stage.sql` + apply + submodule push + `types.ts` 8 stages + `llm-actions` valid + stages page labels
- [x] T2 `prompt.ts` `buildEnhancePromptMessages` (POLISH, prompt+negative, topic/style, ≤60w)
- [x] T3 `actions.ts` `enhanceImagePrompt` (admin, 30/jam admin-bypass, only if draf ≥10, gate retry)
- [x] T4 `DraftImageCard.tsx` Sempurnakan + side-by-side + Terima/Batal/Urungkan + negative
- [x] T5 `PostImageControl.tsx` sama untuk per-reply (guard image_mode + afiliasi)
- [x] T6 gate `typecheck` ✅ `lint` ✅ `test` 314 ✅

## Risks
- Overwrite intent — mitigasi side-by-side + Batal/Urungkan.
- Gate before — mitigasi retry + surface reasons.
- Biaya — 30/jam + admin bypass, hanya bila draf ada.

## Progress Log
- 2026-09-08 — T1 done (prod applied, supabase push b73a8e6).
- 2026-09-08 — T2-T5 code done.

## Notes
- Hanya polish bila sudah ada draf (≥10), bukan from scratch.
