# Image cover eventual + prompt editable (cover & per-reply)

Created: 2026-09-08 02:52:00

## Objective
Cover `post_index=0` eventual (auto enqueue saat draf dibuat, cron `*/5` 1/tick) + user (admin) bisa edit `image_prompt` (≤500) & `negative_prompt` (≤300) untuk cover dan per-reply lalu Regenerate; `reasoning` simpan `visual_strategy=custom`.

## Scope
- `src/lib/research/development.ts` inline enqueue `content_draft_images` cover
- `src/lib/image/actions.ts` `generateDraftImage/PostImage`terima `imagePrompt/negativePrompt`
- `src/lib/image/worker.ts` gate custom + reasoning custom
- `src/components/content/DraftImageCard.tsx` textarea prompt+negative cover
- `src/components/content/PostImageControl.tsx` prompt edit per-reply

## Milestones
1. Inline enqueue eventual
2. Action prompt-edit
3. Worker gate
4. UI cover + per-reply + gate

## Tasks
- [x] T1 `src/lib/research/development.ts:537` — insert `content_drafts` → `select('id')` + count guard `post_index=0` → `insert {draft_id, post_index:0, image_prompt:''}` eventual (warn log bila gagal)
- [x] T2 `src/lib/image/actions.ts:31` — `generateDraftImage/PostImage(override: {modelUuid?, styleSlug?, imagePrompt?, negativePrompt?})` validasi `min10/max500/300`, insert `{image_prompt: custom?slice, negative_prompt, reasoning:{visual_strategy:'custom'}}`
- [x] T3 `src/lib/image/worker.ts:287` — isCustom gate `validateImagePromptContradiction` fail → `failed`; else LLM; reasoning custom preserved
- [x] T4 `src/components/content/DraftImageCard.tsx` — promptDraft/negativeDraft + textarea 500/300 + chars + Regenerate custom + rehydrate on refresh + negative display
- [x] T5 `src/components/content/PostImageControl.tsx` — model/style + prompt/negative per-reply (guard `image_mode` + skip afiliasi), refresh rehydrate
- [x] T6 gate `typecheck` ✅ `lint` ✅ `test` 314 ✅ + plan docs

## Risks
- Biaya naik (enqueue langsung) — mitigasi cron 1/tick, per-reply tetap opt-in.
- Stale prompt setelah edit post — future badge.
- Custom bypass before/after — gate T3.

## Progress Log
- 2026-09-08 02:52 UTC — T1-T5 done.
- 2026-09-08 03:20 UTC — gate hijau (typecheck/lint/test 314).

## Notes
- Draft rujukan `126893cf-1cdf-4d0e-b846-13ead43d9594` needs_review threads — belum ada image; backlog 54 tanpa cover.
