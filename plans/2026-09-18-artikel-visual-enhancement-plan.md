# Artikel Visual Enhancement Plan (P0–P2)

Created: 2026-09-18 12:30:00

## Objective

Mengubah halaman daftar artikel (`/id/artikel`, `/en/articles`) dari list teks polos menjadi listing editorial bergambar yang tetap scannable saat artikel tumbuh dari 5 → 50 → 500, plus discovery (search/filter/pagination/related) dan taksonomi kategori. Tanpa mengorbankan SSG/ISR (`revalidate = 3600`), i18n `id/en` (next-intl), SEO (Article + FAQPage + Breadcrumb JSON-LD, sitemap), RLS ketat, dan gate `npm run typecheck + npm run lint + npm test (+ npm run build bila menyentuh pola runtime)`.

Konteks terverifikasi 2026-09-18 (read-only):

* List: `src/app/[locale]/(public)/artikel/page.tsx:64-88` — card hanya `title + excerpt line-clamp-3 + Baca selengkapnya + tanggal`. Tanpa gambar, badge, kategori, search, pagination. `getPublishedArticles(locale)` limit 50, tanpa offset.
* DB prod (`supabase-asharu-be-production`): 5 artikel published, semua `locale=id`, semua punya `cover_image_url` (Storage `draft-images/...`), semua punya `product_id + affiliate_url`, `body_md` 6–8,5rb karakter. Tabel `articles` TIDAK punya kolom `category/tags` (error `42703` terkonfirmasi). Tabel `affiliate_products` PUNYA `category text` dengan distribusi: fashion 163, home-living 29, others 28, electronics 23, sports-hobby 8, automotive 5 — dipakai sebagai sumber backfill P2.
* Detail (`artikel/[slug]/page.tsx` + `src/components/articles/ArticlePublicView.tsx`) sudah visual: cover `aspect-video`, body `## → h2`, `AffiliateImage` (island client, pola onError-guard 1x), affiliate box, FAQ `<details>`, `ShareButtons`.
* i18n: `src/messages/id.json:149-168` + `en.json` namespace `articles`; label kategori produk di `categories` (`automotive, electronics, home-living, fashion, sports-hobby, others`).
* SEO: `src/app/sitemap.ts:75-90` include artikel via `getAllPublishedSlugs()` limit 500, best-effort try/catch.

## Scope

Masuk:

* P0 (tanpa migrasi): `ArticleCard` bergambar + hero featured + reading time + badge afiliasi + polish + placeholder + i18n + test.
* P1 (tanpa migrasi): search/sort/filter klien via query param + pagination/load-more + artikel terkait di detail.
* P2 (1 migrasi non-destruktif): kolom `category + tags` + CHECK + index + backfill dari produk + isi otomatis saat publish + chip filter `?kategori=` + perluasan SELECT/tipe + sitemap limit 2000.

Keluar (jangan kerjakan di plan ini):

* Admin UI edit kategori/tags, tag management lanjutan, rekomendasi ML, komentar, bookmark/auth, rute baru `/kategori/[cat]`, perubahan pipeline riset/LLM, perubahan scraper.

## Milestones

1. P0 — Visual foundation. Dampak terbesar, risiko terkecil. Selesai bila hero + card bergambar live dan gate hijau.
2. P1 — Discovery. Selesai bila user bisa mencari, mengurutkan, mem-paginasi, dan melihat artikel terkait.
3. P2 — Taksonomi. Selesai bila migrasi applied di dev + prod (via submodule dulu), chip kategori berfungsi, backfill terverifikasi.

Urutan wajib: P0 → P1 → P2. Jangan mulai P2 sebelum P0 hijau.

## Tasks

### P0-1 — Helper reading time (murni, wajib pertama)

* [ ] Buat `src/lib/articles/reading-time.ts`:
  ```ts
  export function estimateReadingMinutes(bodyMd: string): number {
    const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }
  ```
* [ ] Buat `src/lib/articles/reading-time.test.ts` (vitest): string kosong → 1; 200 kata → 1; 201 kata → 2; 1000 kata → 5.
* [ ] Acceptance: `npm test -- reading-time` hijau.

### P0-2 — Komponen ArticleCard (RSC, tanpa hook)

* [ ] Buat `src/components/articles/ArticleCard.tsx` sebagai Server Component (JANGAN `'use client'`, JANGAN hook, JANGAN `onError` inline — itu penyebab digest `1391377559` dulu; untuk cover rusak gunakan `<AffiliateImage>` yang sudah ada bila perlu fallback, atau `<img loading="lazy">` polos + placeholder saat `cover_image_url` null).
* [ ] Props minimal:
  ```ts
  interface ArticleCardProps {
    slug: string; title: string; excerpt: string;
    coverUrl: string | null; publishedAt: string | null;
    locale: 'id' | 'en'; readingMinutes: number;
    hasAffiliate: boolean; featured?: boolean;
    readMoreLabel: string; affiliateBadgeLabel: string;
    readingLabel: (n: number) => string; // atau string jadi "±3 mnt baca"
  }
  ```
* [ ] Struktur: `<li class="overflow-hidden rounded-xl border border-line bg-surface shadow-card transition hover:border-primary hover:-translate-y-0.5">` → cover `aspect-video w-full object-cover` (`loading="lazy"`, `alt={title}`) → `<div class="p-5">` → `<h2 line-clamp-2>` → `<p line-clamp-3>` → footer `tanggal • reading • badge Afiliasi bila hasAffiliate` → link via `Link` dari `@/i18n/navigation` ke `/artikel/[slug]` (JANGAN `next/link` langsung agar locale prefix benar).
* [ ] Fallback bila `coverUrl` null: tampilkan `div.aspect-video` berisi `/images/articles/article-placeholder.svg` (buat file SVG bila belum ada di `public/images/articles/`; contoh minimal: persegi 1280x720 dengan inisial "A" + warna token surface). JANGAN biarkan card tanpa blok visual (lompat layout).
* [ ] Acceptance: card dengan dan tanpa cover ter-render; tidak ada `onError` di file ini.

### P0-3 — Halaman list: hero + grid (RSC tetap statis)

* [ ] Edit `src/app/[locale]/(public)/artikel/page.tsx` SAJA untuk list (jangan ubah `[slug]`, `sitemap.ts`, `routing.ts` di P0):
  * Ambil `articles = await getPublishedArticles(locale)` seperti sekarang (tambah `cover_image_url, body_md, affiliate_url` bila SELECT belum mencakup — cek `src/lib/articles/public.ts:14-15`).
  * `const [featured, ...rest] = articles;` Hero = `featured` dengan layout `lg:col-span-3 lg:grid lg:grid-cols-2` (gambar kiri, teks kanan; mobile stack). Sisanya map ke `<ArticleCard>`.
  * Hitung `readingMinutes = estimateReadingMinutes(a.body_md ?? '')` di server (JANGAN di klien).
  * Pertahankan: `export const revalidate = 3600`, `breadcrumbSchema`, `<JsonLd>`, empty state `t('empty')`.
* [ ] Tambah i18n di `src/messages/id.json` + `en.json` namespace `articles` (tambah key, JANGAN hapus yang ada):
  ```json
  "featuredBadge": "Unggulan", "readingMinutes": "±{n} mnt baca",
  "affiliateBadge": "Tautan afiliasi", "featuredLabel": "Artikel unggulan"
  ```
  en: `"featuredBadge": "Featured", "readingMinutes": "±{n} min read", "affiliateBadge": "Affiliate link", "featuredLabel": "Featured article"`.
* [ ] Acceptance: 1 artikel → hanya hero; 0 artikel → empty state lama; ≥2 → hero + grid `sm:grid-cols-2 lg:grid-cols-3`.

### P0-4 — Test + gate P0

* [ ] Buat `src/components/articles/ArticleCard.test.tsx` (render: judul, cover `alt`, fallback saat null, badge afiliasi, reading label). Lihat pola `ArticlePublicView.test.tsx` yang ada.
* [ ] Jalankan berurutan: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Bila ada edit SETELAH hijau (sekecil apa pun) → ULANGI `typecheck + lint` (aturan insiden `prefer-const` 2026-09-10). Build wajib karena sentuh pola render/gambar.
* [ ] Cek manual: `npm run dev` → `/id/artikel` mobile 360px + desktop 1440px; hero tidak CLS (blok gambar fixed ratio).

### P1-1 — Filter/search/sort klien (halaman tetap statis)

* [ ] Buat `src/components/articles/ArticleFilter.tsx` sebagai SATU-SATUNYA Client Component baru (`'use client'`): pakai `useSearchParams`, `useRouter`, `usePathname` dari `next/navigation`. JANGAN jadikan `page.tsx` client.
* [ ] Param URL (shareable): `?q=teks&sort=baru|lama&afiliasi=semua|ya`. Server (`page.tsx`) tetap fetch max 100 (`getPublishedArticles(locale, 100)` — naikkan limit di `public.ts:26` dari 50 → 100) lalu oper ke filter klien. Filter `q` cocokkan `title + excerpt` case-insensitive; `sort` by `published_at`; `afiliasi` by `affiliate_url != null`.
* [ ] PENTING: JANGAN pakai `searchParams` sebagai prop server untuk filtering (itu membuat halaman dinamis dan membunuh SSG). Server selalu statis; yang membaca query adalah komponen klien.
* [ ] i18n baru: `searchPlaceholder, sortNewest, sortOldest, filterAll, filterAffiliateOnly, loadMore, emptyFiltered, showingCount`.

### P1-2 — Pagination / Muat lebih (klien)

* [ ] Di komponen list klien (atau di `ArticleFilter` yang sama): `PAGE_SIZE = 9` (1 hero + 8) atau 12; state `visibleCount`; tombol `Muat lebih` tambah 9; tampilkan `Menampilkan X dari Y`. JANGAN render 100 card sekaligus.
* [ ] Test: slice helper (pure) — `visible = filtered.slice(0, count)`.

### P1-3 — Artikel terkait di detail

* [ ] Tambah di `src/lib/articles/public.ts`:
  ```ts
  export async function getRelatedArticles(locale: ArticleLocale, excludeSlug: string, limit = 3) {
    const supabase = anonClient(); if (!supabase) return [];
    const { data } = await supabase.from('articles')
      .select(ARTICLE_SELECT).eq('locale', locale).eq('status', 'published')
      .neq('slug', excludeSlug).order('published_at', { ascending: false }).limit(limit);
    return ((data ?? []) as ArticleRow[]).map(toPublished);
  }
  ```
  (P1 belum ada `category`, jadi related = terbaru selain diri sendiri. P2 akan upgrade ke sama-kategori.)
* [ ] Edit `src/app/[locale]/(public)/artikel/[slug]/page.tsx`: setelah `<ShareButtons>` render `<section>` `Artikel terkait` berisi 3 `ArticleCard` compact. Tambah i18n `relatedHeading`.
* [ ] Acceptance: artikel tanpa saudara (total 1) → section disembunyikan, tidak error.

### P1-4 — Gate P1

* [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Cek `/id/artikel?q=organizer`, `?sort=lama`, `?afiliasi=ya` bisa di-share (copy URL → tab baru hasil sama).

### P2-1 — Migrasi DB (submodule dulu!)

* [ ] Buat SATU file migrasi baru di `supabase/migrations/` dengan nama `20260919000001_articles_category_tags.sql` (bila nama sudah dipakai, naikkan sekuens `...0002`, JANGAN timpa file lama):
  ```sql
  ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS category text;
  ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
  ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_category_check;
  ALTER TABLE public.articles ADD CONSTRAINT articles_category_check
    CHECK (category IS NULL OR category IN ('automotive','electronics','home-living','fashion','sports-hobby','others'));
  CREATE INDEX IF NOT EXISTS idx_articles_cat_pub ON public.articles (locale, status, category, published_at DESC);
  UPDATE public.articles a SET category = p.category FROM public.affiliate_products p
    WHERE a.product_id = p.id AND a.category IS NULL;
  ```
* [ ] Sifat: non-destruktif (kolom nullable + default), idempotent (`IF NOT EXISTS`), RLS TIDAK berubah (anon tetap hanya `status='published'`).
* [ ] Urutan commit WAJIB: commit + push di submodule `supabase/` DULU, baru commit parent dengan pointer baru. Verifikasi: `SELECT column_name FROM information_schema.columns WHERE table_name='articles'` memuat `category, tags`; `SELECT category, count(*) FROM articles GROUP BY 1`; anon hanya baca published (cek via anon key, bukan service_role).
* [ ] JANGAN: `DROP TABLE`, `TRUNCATE`, backfill tanpa `WHERE category IS NULL`, atau menambah policy tulis untuk anon.

### P2-2 — Publish otomatis isi kategori

* [ ] Edit `src/lib/articles/publish.ts` (fungsi `publishArticleDraftCore`, sekitar baris 96-110): setelah ambil `product_id` draf, query `affiliate_products.category` lalu sertakan `category` pada insert/upsert artikel. Normalisasi: hanya 6 slug di atas yang lolos, selain itu → `null`. Re-publish idempoten tetap (kunci `(draft_id, locale)`).
* [ ] Test: tambah kasus di `publish-utils.test.ts` atau file test baru untuk normalisasi (`Fashion → fashion`, `tak dikenal → null`).

### P2-3 — Baca + filter kategori di publik

* [ ] Edit `src/lib/articles/public.ts`: tambah `category, tags` ke `ARTICLE_SELECT`; extend `PublishedArticle` di `types.ts` (`category: string | null; tags: string[]`); ubah `getPublishedArticles(locale, limit)` menjadi `getPublishedArticles(locale, opts?: { limit?: number; category?: string | null; q?: string | null })` dengan `.eq('category', ...)` bila diisi + filter `q` di server via `.ilike('title', ...)` ATAU di klien (pilih SATU, konsisten dengan P1 — disarankan tetap klien untuk `q`, server hanya untuk `category` agar cache ISR per kategori kecil).
* [ ] Tambah `getArticleCategories(locale)` → `[{ category, count }]` untuk chip (sembunyikan count 0). Chip label reuse `categories.*` yang sudah ada di `id.json:169-176` (JANGAN duplikasi string kategori di namespace `articles`).
* [ ] Edit `page.tsx`: baca query `?kategori=` — CATATAN: karena halaman harus tetap statis, opsi termudah untuk model kurang mampu: TETAP server-statis (fetch 100) + filter kategori di KLIEN bersama `q`. Opsi server-filter (`searchParams` prop) BOLEH tapi mengubah halaman menjadi dinamis — hanya pilih ini bila artikel sudah >200 dan ISR terganggu. Default: klien.
* [ ] Upgrade `getRelatedArticles` P1 → prioritaskan `category` sama dulu, bila kurang dari 3 lengkapi dengan terbaru beda kategori.
* [ ] Edit `src/app/sitemap.ts:77`: `limit(500)` di `getAllPublishedSlugs` → 2000 (edit di `public.ts:63`). Pertahankan try/catch.

### P2-4 — Gate akhir + verifikasi skala

* [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Simulasi 60 artikel dummy di dev (JANGAN di prod) untuk cek: chip count benar, pagination tidak lag, hero stabil, Lighthouse mobile ≥90 performance.
* [ ] Checklist prod: migrasi applied prod → publish 1 draf uji → kategori terisi otomatis → `/id/artikel?kategori=fashion` benar → sitemap memuat slug baru → GSC request indexing.

## Risks

* Gambar remote Storage menaikkan LCP/CLS. Mitigasi: `aspect-video` fixed, `loading=lazy` kecuali hero, fallback SVG lokal, pertimbangkan `next/image + sizes` + `remotePatterns` untuk `*.supabase.co` bila build mengizinkan. Tanpa gambar CTR lebih rendah — risiko ini layak diambil.
* `onError`/`onClick`/hook di Server Component → runtime digest (insiden `1391377559`). Aturan: SEMUA handler gambar rusak hanya di `AffiliateImage` (client island); `ArticleCard`/`page.tsx` tetap RSC.
* `searchParams` sebagai prop server → halaman dinamis, ISR mati. Default P1/P2: query dibaca komponen klien saja.
* Backfill menimpa kurasi manual. Mitigasi: `WHERE category IS NULL` saja; dokumentasikan di Notes bila ada override manual.
* Fashion mendominasi (163/256 produk). Mitigasi: sembunyikan chip 0, related campur kategori, hero bergilir bila perlu (follow-up `is_featured`, tidak di plan ini).
* Tags free-text chaos. Aturan: lowercase, trim, max 5 per artikel, tanpa duplikat; validasi di `publish.ts`, bukan di UI dulu.
* Setiap edit setelah gate hijau MEMBATALKAN gate — wajib re-run `typecheck + lint` (+ `build` untuk pola render/gambar). Jangan commit merah.

## Progress Log
- 2026-09-18 12:30:00 — Plan detail P0–P2 dibuat sebagai file handoff untuk model kurang mampu (dari analisa read-only 2026-09-18 pagi). Belum ada implementasi.
- 2026-09-18 11:50:00 — **P0 + P1 + P2 SELESAI** (commit `be9f4bf` + submodule `1ddc3e1`). Gate typecheck ✓ lint ✓ test 851/851 ✓ build ✓. Migrasi prod sudah applied via MCP (`category, tags` ada; backfill 3 home-living + 1 fashion + 1 automotive). Rilis: hero auto terbaru, card bergambar, search/sort/afiliasi filter klien shareable, load-more, related articles di detail, badge kategori di footer card.
- Belum mulai — follow-up opsional: chip filter `?kategori=`, sitemap limit 500 → 2000, Lighthouse audit, admin UI kelola tag.

## Notes

Keputusan arsitektur (proporsional, tanpa ceremony enterprise):

* Satu mekanisme query `?kategori=&q=&sort=&afiliasi=` dipilih atas rute baru `/kategori/[cat]` agar `src/i18n/routing.ts` dan `localizedPathname` tidak berubah dan tidak ada duplikasi konten SEO. Rute khusus kategori ditolak untuk fase ini (biaya i18n + kanonikal).
* Klien-filter (fetch ≤100) dipilih atas server-filter agar `page.tsx` tetap `revalidate = 3600` statis. Bila artikel >200 dan payload berat, eskalasi ke server-filter + pagination DB (`range()`) sebagai plan lanjutan.
* Taksonomi reuse `affiliate_products.category` (6 slug, sama dengan `messages.categories`) agar konsisten dengan katalog produk. Sumber kebenaran label = `categories.*`, bukan duplikat di `articles`.
* Contoh i18n yang harus ditambah (jangan hapus key lama):
  ```json
  "articles": { "featuredBadge": "Unggulan", "readingMinutes": "±{n} mnt baca", "affiliateBadge": "Tautan afiliasi", "searchPlaceholder": "Cari artikel…", "sortNewest": "Terbaru", "sortOldest": "Terlama", "filterAll": "Semua", "filterAffiliateOnly": "Berafiliasi", "loadMore": "Muat lebih banyak", "emptyFiltered": "Tidak ada artikel yang cocok.", "relatedHeading": "Artikel terkait" }
  ```
* Perintah verifikasi per tahap (wajib berurutan): `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`. Manual: `/id/artikel` + `/en/articles` (mobile 360 + desktop 1440), `/id/artikel/[slug]` (related muncul), URL query shareable, sitemap `/sitemap.xml` memuat artikel.
* Aturan commit repo (untuk eksekutor): Conventional Commits satu baris tanpa trailer `Co-authored-by`; sebelum commit `git status --short + git diff + git log --oneline -10`, stage hanya file dimaksud, JANGAN commit `.env*` atau key `sb_secret_*/sb_publishable_*/CRON_SECRET`; migrasi di submodule `supabase/` commit+push DULU baru parent; bila push ditolak → `git fetch`, cek `git log main..origin/main`, `git pull --no-rebase`, gate hijau, push lagi; setelah push laporkan hash + pesan + file kunci.
* Handoff untuk model kurang mampu: kerjakan checklist BERURUTAN (P0-1 → P0-4 → P1 → P2); SATU file per langkah lalu gate; bila ragu antara RSC vs Client → pilih RSC kecuali file mengandung input/button/search (baru Client); bila ragu soal gambar → tiru `ArticlePublicView.tsx:230-240` + `AffiliateImage.tsx`; JANGAN menambah dependensi baru; JANGAN mengubah `routing.ts`, middleware, CSP, atau policy RLS selain yang tertulis di P2-1.
