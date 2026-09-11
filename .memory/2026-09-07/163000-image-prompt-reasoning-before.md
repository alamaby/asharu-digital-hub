# Image Prompt Reasoning Before + Contradiction Gate

## Task
Fix kontradiksi draft 6d9658e9: main post pain-hook ("sempit dan berantakan")
dapat visual After (neat/organized/spacious, negative ban messy). Tambah reasoning
eksplisit LLM + gate deterministik sebelum provider, default Before.

## Key files changed
- `src/lib/image/prompt.ts` — VisualStrategy before/after/bridge, PAIN_KEYWORDS,
  AFTER_WORDS_BANNED_UNDER_BEFORE, detectPainKeywords, reasoning schema,
  validateImagePromptContradiction gate.
- `src/lib/image/worker.ts` — konteks penuh (keyFacts fix dead field, uniqueAngle,
  threadSnippet, postIndex), gate + 1x retry suhu rendah, gagal jujur tanpa kirim
  ke provider, persist reasoning.
- `supabase/migrations/20260907000007_image_reasoning.sql` — reasoning jsonb +
  index strategi (non-destruktif). Applied production via MCP.
- `src/lib/image/providers.test.ts` — 6 test baru (gate kasus 6d9658e9).
- `src/components/content/DraftImageCard.tsx` + review page — tampil strategi/hook/justifikasi.

## Decisions
- Default pain hook = Before (relatable messy, not filthy); negative Before dilarang
  ban cramped/messy, dilarang muat neat/organized/spacious.
- Reasoning di kolom jsonb baru (bukan reuse llm_meta) agar query/audit mudah.
- Retry hanya 1x saat gate gagal, maxTokens 500.

## Assumptions / risks
- Before kumuh bisa turunkan CTR — brief relatable, tetap photorealistic.
- Gambar lama 6d9658e9 tetap After (tidak di-regenerate otomatis); regenerate manual
  via review akan pakai alur baru.

## Verification
- `npm run typecheck` ✓, `npm run lint` ✓ (warning postIndex fixed), `npm test`
  314 passed (40 files, +6 image) ✓.
- Migrasi applied production (apply_migration success) + file di submodule.
- Secret scan diff: bersih.

## Commit
- Submodule `0f83fd4 feat(image): reasoning column for image prompt strategy` (pushed).
- Parent `58040c5 feat(image): reasoning before visual plus contradiction gate` (pushed).

## Related
- `plans/2026-09-07-image-prompt-reasoning-before.md`
