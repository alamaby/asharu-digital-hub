# Artikel visual enhancement P0–P2

Implements scalable article listing visual with search/filter/pagination + category taxonomy.

## Key files changed
- `src/lib/articles/reading-time.ts` / `.test.ts` — word-count → minutes helper (pure)
- `src/components/articles/ArticleCard.tsx` / `.test.tsx` — server-side card (RSC, no hook/onError)
- `src/components/articles/ArticleGrid.tsx` — client-side list with search/sort/affiliate filter + load-more
- `src/app/[locale]/(public)/artikel/page.tsx` — ISR 3600 list; fetches ≤100, passes to ArticleGrid
- `src/app/[locale]/(public)/artikel/[slug]/page.tsx` — related articles section below ShareButtons
- `src/lib/articles/public.ts` — extended SELECT + `getRelatedArticles(locale, excludeSlug, limit=3)`
- `src/lib/articles/publish.ts` — auto-fills `category` from `affiliate_products.category` on publish (6 valid slugs only)
- `src/lib/articles/types.ts` — `PublishedArticle` gains `category: string|null` + `tags: string[]`; adds `VALID_ARTICLE_CATEGORIES` constant
- `src/messages/id.json` + `en.json` — new keys under `articles`: featuredBadge, readingMinutes, affiliateBadge, searchPlaceholder, sortNewest/Oldest, filterAll/AffiliateOnly, loadMore, emptyFiltered, showingCount, relatedHeading
- `public/images/articles/article-placeholder.svg` — 1280×720 fallback for missing cover images
- `supabase/migrations/20260918000005_articles_category_tags.sql` (pushed to submodule, parent pointer updated) — ALTER articles ADD COLUMN category/tags, CHECK constraint, index, backfill from products WHERE category IS NULL

## Technical decisions
- Hero/featured auto = artikel terbaru (`articles[0]`); tidak pakai flag `is_featured` manual (follow-up).
- Search/sort/afiliasi filter di KLIEN via query param URL shareable; halaman tetap statis ISR (`revalidate=3600`).
- Category badge hanya muncul jika DB sudah di-migrasi; sebelum itu null-safe.
- `onError` gambar aman di RSC karena tidak dipakai — fallback pakai placeholder lokal saat `cover_image_url null`.
- Migrasi non-destruktif, idempotent (IF NOT EXISTS, DROP CONSTRAINT IF EXISTS). Backfill hanya WHERE category IS NULL agar tak timpa kurasi manual.
- Gate: typecheck ✓, lint ✓, test 851/851 ✓, build ✓.

## Blockers / follow-up
- [ ] Apply migration `20260918000005` di prod via MCP → verify `SELECT column_name ... articles` memuat `category, tags`; publish 1 draf uji → cek kategori terisi.
- [ ] Tambah chip filter kategori di `ArticleGrid` (query param `?kategori=`) + `getArticleCategories(locale)` bila artikel > 20.
- [ ] Naik limit sitemap dari 500 → 2000 di `getAllPublishedSlugs()` setelah migrasi prod.
- [ ] Verifikasi live Lighthouse mobile ≥90 (gambar loading=lazy; hero eager).
