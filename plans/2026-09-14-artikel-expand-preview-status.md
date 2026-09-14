# Expand picker + preview artikel + label status visual

Created: 2026-09-14 15:00:00

## Objective

1. Fitur Kembangkan artikel bisa pilih provider + model (ikuti pola regen afiliasi).
2. Preview review menampilkan artikel seperti tampil publik.
3. Hilangkan label mentah `prompt_ready` di panel visualisasi.

## Scope

- `src/lib/articles/actions.ts` (`expandArticleDraft` + `modelId` + rate limit)
- `src/components/content/ArticleDraftCard.tsx` (picker + tab pratinjau)
- `src/components/articles/ArticlePublicView.tsx` (baru, bersama publik + review)
- `src/app/[locale]/(public)/artikel/[slug]/page.tsx` (refactor pakai komponen bersama)
- `src/components/content/ImageHistoryCarousel.tsx` (label status Indonesia)
- `src/messages/id.json` + `en.json` (key `content.review.*` baru)
- Tanpa migrasi DB. Preview client wajib namespace `content.*` (allow-list `client-messages.ts`).

## Milestones

1. Expand picker (action + UI)
2. Preview bersama + refactor publik
3. Label status + test
4. Gate + commit/push

## Tasks

- [x] Investigasi read-only + rencana
- [x] Action `modelId` + validasi aktif + rate limit + `llm_meta.expand_model`
- [x] Picker di ArticleDraftCard (props dari ContentDraftCard)
- [x] `ArticlePublicView` + ekstrak `MarkdownBody` + refactor public page
- [x] Tab Draf/Pratinjau di review (cover terpilih + box afiliasi + FAQ)
- [x] `STATUS_LABEL` carousel + test label
- [x] i18n paritas + gate + commit + push + memory

## Risks

- Refactor public page: mitigasi build + markup 1:1, class tak diubah.
- Preview tak 100% identik (chrome halaman, JSON-LD) — badge frame eksplisit.
- Pin model gagal: fallback waterfall `runLLMCompletion` sudah ada.

## Progress Log

- 2026-09-14 15:00:00 — Plan dibuat; masuk build mode.
- 2026-09-14 15:35:00 — Selesai. Gate hijau: typecheck + lint + 570 tests + build. Tanpa migrasi DB.

## Notes

Fitur kecil — tanpa TOGAF/C2M ceremony. Trade-off: duplikasi markup ditolak, pilih komponen bersama (drift-proof).
