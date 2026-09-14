# Render markdown ringan di body artikel

- Task: `*`/`**` dari output LLM tampil mentah sebagai teks (contoh draf 419a2dc8: `*must-have item*`, `*heatstroke*`).
- Key files:
  - `src/components/articles/ArticlePublicView.tsx` — `renderRichText`: `**tebal**` → strong, `*miring*` → em, URL → anchor (gabung dengan `linkifyText`); `*` tak berpasangan tetap literal. Dipakai `ArticleMarkdownBody` (publik + pratinjau).
  - `src/components/content/ArticleDraftCard.tsx` — body section draf ikut `renderRichText` (WYSIWYG).
  - `src/components/articles/ArticlePublicView.test.tsx` — +3 tests (bold/italic, kombinasi, bintang literal).
- Decisions/limits: bukan parser markdown penuh (tanpa list, heading inline, nesting, code) — cukup untuk output LLM; H2/excerpt tak di-rich-render.
- Verification: typecheck ✓, lint ✓, 577 tests ✓ (67 files), build ✓ (63 pages).
