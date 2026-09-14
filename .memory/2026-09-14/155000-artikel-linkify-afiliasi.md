# Link afiliasi bisa diklik di body artikel

- Task: URL produk afiliasi inline di body artikel tadinya teks polos (publik, pratinjau, draf review) — hanya CTA box afiliasi yang bisa diklik.
- Key files:
  - `src/components/articles/ArticlePublicView.tsx` — helper `linkifyText` (URL http/https → anchor target _blank + `noopener noreferrer`, tanda baca akhir kalimat tak ikut href, anchor polos agar 1 URL aneh tak crash render) dipakai `ArticleMarkdownBody` (publik + pratinjau otomatis).
  - `src/components/content/ArticleDraftCard.tsx` — body section draf ikut `linkifyText`.
  - `src/components/articles/ArticlePublicView.test.tsx` (baru, 4 tests).
- Decisions: anchor polos bukan `ExternalLink` (itu throw untuk URL unsafe — risiko crash seluruh halaman); H2 tidak di-linkify (tetap teks).
- Verification: typecheck ✓, lint ✓, 574 tests ✓ (67 files), build ✓ (63 pages).
