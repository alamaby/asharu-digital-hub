# Expand picker + preview artikel + label status visual

- Task: (1) pilih provider/model untuk Kembangkan artikel, (2) tab Pratinjau mirip halaman publik, (3) hilangkan label mentah `prompt_ready`.
- Key files:
  - `src/lib/articles/actions.ts` — `expandArticleDraft(draftId, {modelId})`: pin divalidasi aktif (error eksplisit), rate limit `expand_article` 10/jam non-admin + admin bypass, `llm_meta.expand_model`.
  - `src/components/content/ArticleDraftCard.tsx` — `StageModelPicker` di area thin + tab Draf/Pratinjau + props `coverUrl/expandProviders/expandModels`.
  - `src/components/articles/ArticlePublicView.tsx` (baru) — tampilan bersama (header, cover, `ArticleMarkdownBody`, box afiliasi, FAQ, disclosure); string via props (server `articles.*`, review `content.review.*` — allow-list client).
  - `src/app/[locale]/(public)/artikel/[slug]/page.tsx` — refactor pakai `ArticlePublicView` (SEO/JSON-LD tetap, markup 1:1).
  - `src/components/content/ContentDraftCard.tsx` — teruskan cover terpilih + katalog model ke cabang artikel.
  - `src/components/content/ImageHistoryCarousel.tsx` — `IMAGE_STATUS_LABEL` (Antre/Draf prompt/Siap/Dipilih/Gagal).
  - `src/messages/id.json` + `en.json` — 15 key `content.review.articlePreview*/articleTab*/articleExpandModelLabel` (paritas).
- Decisions:
  - Komponen bersama (bukan duplikasi markup) agar preview tak drift dari publik; `MarkdownBody` diekstrak (garansi body identik).
  - Preview jujur: tanpa tanggal terbit (draf belum terbit), badge frame eksplisit bukan halaman sebenarnya, disclosure tanpa link.
  - Silent-fallback pin model ditolak — error minta refresh pilihan.
- Assumptions/risks: refactor publik 1:1 terverifikasi build; pin gagal → fallback waterfall `runLLMCompletion` tetap ada.
- Blockers: none. Follow-up: repair loop emoji; image per-section (fase 2 lama).
- Verification: typecheck ✓, lint ✓, `npm test` ✓ (570 passed incl. test label baru), `npm run build` ✓ (63 pages).
- Plan: `plans/2026-09-14-artikel-expand-preview-status.md`.
