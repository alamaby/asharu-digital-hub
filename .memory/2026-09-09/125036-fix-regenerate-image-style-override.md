# Fix: Regenerate image draft pakai pilihan styling

Task: Verifikasi + perbaikan bahwa proses Regenerate image di review draf memakai pilihan Style (dropdown), bukan selalu `photorealistic`.

## Hasil Audit
- Frontend (`DraftImageCard`/`PostImageControl`) sudah kirim `styleSlug` → `llm_meta.override` → worker meneruskan ke `resolveImageTarget`.
- Bug di `src/lib/image/config.ts`: `draftOverride.styleSlug` hanya dibaca di cabang `if (draftOverride?.modelUuid)`. Saat Model = Auto (modelUuid kosong), style jatuh ke `session.image_style_slug ?? defaults.style_slug` → `photorealistic`.

## Perubahan
- `src/lib/image/config.ts` — `resolveImageTarget`: style di-resolusi sekali di awal (prioritas `draftOverride.styleSlug > session > global`), dipakai semua 4 cabang model.
- `src/lib/image/actions.ts` — `enhanceImagePrompt` param baru `styleSlug?` (hint suffix LLM mengikuti pilihan, bukan default).
- `src/components/content/DraftImageCard.tsx` — enhance kirim `styleSlug`; rehydrate dropdown style dari image terakhir (init + refresh).
- `src/components/content/PostImageControl.tsx` — enhance kirim `styleSlug`; rehydrate di refreshOne.
- `src/lib/image/config.test.ts` — 9 kasus prioritas style; `vitest.server-only-stub.ts` + alias `server-only` di `vitest.config.ts` (test pertama yang mengimpor modul server-only).
- `plans/2026-09-09-regenerate-image-style-override.md` — plan + progress log.

## Keputusan / Asumsi
- Rehydrate style = hanya bila slug aktif di `image_style_presets`; baris pending (tanpa style_slug) tidak menimpa pilihan user.
- Model tidak di-rehydrate (mapping model_id→UUID berisiko, bukan bagian bug).
- Tanpa migrasi: preset `anime` sudah ada sejak `20260907000005`.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (324 tests, 41 files).
- E2E manual (usulan): pilih Auto+Anime → Regenerate → cek `style_slug=anime` + suffix anime di prompt final.

## Commit
`fix(image): honor style picker override saat model Auto di regenerate draf`
