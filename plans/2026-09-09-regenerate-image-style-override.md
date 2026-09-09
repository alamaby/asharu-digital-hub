# Regenerate Image Draft Pakai Pilihan Styling

Created: 2026-09-09

## Objective
Pastikan proses Regenerate gambar di review draf benar-benar memakai pilihan styling (dropdown Style), bukan selalu jatuh ke `photorealistic`.

## Scope
- `src/lib/image/config.ts` — `resolveImageTarget`
- `src/lib/image/actions.ts` — `enhanceImagePrompt` (hint style suffix)
- `src/components/content/DraftImageCard.tsx` + `PostImageControl.tsx` — kirim styleSlug ke enhance + rehydrate dropdown
- Test unit `resolveImageTarget`

## Akar Masalah
`draftOverride.styleSlug` hanya dibaca di dalam cabang `if (draftOverride?.modelUuid)` (pinned model). Saat admin memilih `Provider = Auto` (modelUuid kosong), kode loncat ke cabang session/global/waterfall yang hanya me-resolve `session.image_style_slug ?? defaults.style_slug` → `photorealistic` (default global). Pilihan `Anime` hilang.

## Milestones
1. Fix prioritas style di `resolveImageTarget`
2. Konsistensi enhance (hint suffix sesuai pilihan)
3. UX: dropdown mencerminkan style yang terpakai
4. Verifikasi + commit

## Tasks
- [x] T1 `config.ts` — style di-resolusi sekali di awal dengan prioritas `draftOverride.styleSlug > session > global`, dipakai semua 4 cabang
- [x] T2 `actions.ts` — `enhanceImagePrompt(draftId, postIndex, prompt, negative, styleSlug?)` teruskan sebagai `draftOverride`
- [x] T3 `DraftImageCard.tsx` — enhance kirim `styleSlug`; rehydrate dropdown style dari image terakhir (init + refresh)
- [x] T4 `PostImageControl.tsx` — enhance kirim `styleSlug`; rehydrate di refreshOne
- [x] T5 `src/lib/image/config.test.ts` — 9 kasus prioritas style (stub `server-only` via alias vitest)
- [x] T6 Gate `typecheck` + `lint` + `test` → commit + push

## Risks
- Style slug override yang sudah di-unpublish (`is_active=false`) → fallback ke default (ditest).
- Rehydrate style saat "Muat ulang" sebelum worker selesai: baris pending tidak punya `style_slug` → pilihan user tidak di-overwrite (guard `latest?.style_slug`).
- Prompt custom lama di history tetap suffix lama; hanya regenerate baru yang berubah (by design).

## Progress Log
- 2026-09-09 — Audit: frontend + worker sudah meneruskan `styleSlug`; bug di `config.ts:104` (styleSlug hanya dibaca saat modelUuid terpin). Fix + test + gate, commit.

## Notes
Tidak ada perubahan skema/migrasi — `image_style_presets` sudah ada (`anime` di migrasi `20260907000005_image_style_ugc_pov.sql`).
