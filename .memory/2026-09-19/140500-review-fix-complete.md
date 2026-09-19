# Review 36bb2945 Fix — CJK Gate, Cover Truncate, Selection, Article Editor

Completed: 2026-09-19 14:05 (local time)
Commit: `f750164` + `bc0d3f0`

## Objective

Perbaiki 4 temuan review `36bb2945` pada artikel draf `needs_review` (`platform_slug=artikel`):
1. Karakter CJK terselip di body/FAQ/article JSON
2. Cover prompt terpotong di tengah kata (`slice(0,500)` brutal)
3. `::selection` wash tipis (transparent) tak terlihat di dark mode
4. Tidak ada UI sunting untuk draf & published artikel

## Changes

### M1 — CJK gate + prompt (`src/lib/llm/prompt.ts`)
- Export `CJK_RE` + `findCjkHit()` di dekat `ARTICLE_EMOJI_RE` (~line 537)
- `parseArticleLang`: tolak CJK di title, excerpt, setiap section h2/body, faq q/a, meta_title, meta_desc → return null
- `buildArticlePrompt` + `buildArticleExpandPrompt`: pertegas BAHASA rule dengan contoh CJK (`散热/关闭/夹式/团战`) dan kalimat "DILARANG keras"
- 6 test baru di `prompt-article.test.ts` (CJK_RE, findCjkHit, reject body/FAQ, system prompt check)

### M2 — Cover prompt truncate sadar-kalimat (`src/lib/image/prompt.ts`)
- Tambah `truncateImagePrompt(text, max=500)`: potong di akhir kalimat (. ! ?) atau akhir kata, bukan tengah kata
- Replace `parsed.image_prompt.trim().slice(0,500)` → `truncateImagePrompt(parsed.image_prompt)`
- Replace 3 call site di `actions.ts` (customPrompt, enhPrompt, effectivePrompt)
- Tambah catatan "Target ≤480 karakter agar tidak terpotong di batas 500" di prompt LLM
- `validateImagePromptContradiction` dan negative prompt slice(0,300) TIDAK diubah
- 4 test baru di `src/lib/image/prompt.test.ts` (baru dibuat)

### M3 — Selection opaque solid (`src/app/globals.css`)
- Ganti `rgba(7,89,133,0.18)` → `#075985` solid + `color: #ffffff`
- Tambah `.dark ::selection` → `#7cd4fd` bg + `#0c111d` text
- `::-moz-selection` fallback untuk Firefox
- Hanya 1 tempat diubah, tidak ada Tailwind config changes

### M4 — Editor draf + published (`src/lib/articles/actions.ts` + UI)
**Server actions baru:**
- `updateArticleDraft(draftId, patch)` — merge patch ke locale, validasi CJK/slug/sections/faq/excerpt, re-calculate word_count, simpan llm_meta {edited_at, edited_manually:true}
- `rejectArticleDraft(draftId)` — set status='rejected'
- `resetArticleApproval(draftId)` — set status='needs_review'
- `updatePublishedArticle(articleId, patch)` — update articles table fields (tanpa cover_image_url), revalidate localized paths

**UI baru:**
- `ArticleDraftCard.tsx`: tombol "Sunting" → form inline (title/slug/excerpt/sections+/−/faq+/−/meta) + "Simpan" + "Tolak" sejajar Publish
- `PublishedArticleEditor.tsx` (baru): kartu per-artikel-published dengan tombol "Sunting" (inline slug edit) + "Arsipkan"
- Review page `[draftId]/page.tsx`: render `PublishedArticleEditor` di bawah `ApplyCoverBanner`
- 16 test baru di `actions-article-edit.test.ts`

**I18n:** 30 kunci baru di `id.json` + `en.json`

## Verification
- typecheck: ✅
- lint: ✅ (0 errors, only pre-existing warnings)
- tests: 951 passed (↑16 new)
- build: ✅
- commit: `f750164` fix(review): cjk gate, cover truncate, selection opaque, article edit UI
- push: ✅ to origin/main

## Open Items
- [ ] User perlu manual fix data `36bb2945` via UI baru: ganti `散热→pelepasan panas`, `关闭→tutup`, `夹式→model jepit`, `团战→teamfight`, judul `Lemat→Lemot`, lalu publish ulang 1 locale `id`
- [ ] Verifikasi manual selection di browser (light + dark mode toggle)
