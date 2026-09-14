# Artikel sebagai Platform Riset Baru (SEO)

Tanggal: 2026-09-13 ~21:45 (local)

## Tugas / Masalah

User meminta route baru artikel sebagai pilihan platform di sesi riset: bila review disetujui, tambah postingan artikel sesuai bahasa. Tujuan: SEO website (konten thread selama ini diposting ke platform eksternal → nol nilai index untuk asharu.id).

## Perubahan Kunci

- `supabase/migrations/20260913000001_artikel_platform.sql` (submodule `4b91d56`): seed `platforms('artikel', max_chars NULL, aktif)` + kolom `content_drafts.article_draft` + tabel `articles` (unik `(locale,slug)` + `(draft_id,locale)`, RLS public-read published saja).
- `src/lib/llm/prompt.ts`: `buildArticlePrompt` (800–1500 kata, 4–7 H2, FAQ 3–5, 1× `{{PRODUCT_URL}}` inline, meta+slug), `parseArticleDraft`, `countArticleWords`, `slugifyTitle`, `ARTICLE_MIN_WORDS=600`.
- `src/lib/research/development.ts`: cabang `platform.slug==='artikel'` → `generateArticleAndInsertDraft` (maxTokens 4000, retry 1x, gate lunak thin-content); ekstrak helper `resolveDevelopingModel`/`lookupProviderId`/`enqueueCoverImage` dipakai ulang path thread; `requiredArticleLangs` + `buildArticleMinimalThread` diekspor untuk test.
- `src/lib/articles/`: `types.ts` (+`renderArticleMarkdown`), `publish-utils.ts` (slug unik, irisan bahasa sesi), `actions.ts` (`approveArticleAndPublish` idempoten via upsert, tolak thin-content; `archiveArticle`), `public.ts` (anon read untuk SSG/ISR).
- Review: `ArticleDraftCard.tsx` baru (pratinjau per bahasa + publish per bahasa); `ContentDraftCard` cabang artikel; snippet list + detail page teruskan `sessionLanguage`/`publishedArticles`.
- Publik: `/artikel` + `/artikel/[slug]` ↔ `/articles` (`routing.ts`, `navigation.ts`, `middleware.ts` whitelist, `Footer`, `LanguageSwitcher` fallback ke list karena slug beda per locale); `articleSchema`+`articleFaqSchema` JSON-LD; `sitemap.ts` async + artikel published; messages id/en (`nav.articles`, `meta.artikel`, namespace `articles`, 12 key review).
- `generateIdea` enum platform + fallback form `/konten/baru` mencakup artikel.

## Keputusan

- Tabel `articles` baru (bukan render dari draf): slug stabil, histori, `published_at` untuk sitemap/`datePublished`.
- `language=both` → 2 baris (id+en), slug per locale; hreflang via `buildMetadata`.
- Draf artikel tetap simpan `generated_thread` minimal valid agar CHECK `thread_shape` + list lama tak pecah.
- Thin-content (<600 kata): developing simpan+tandai, publish menolak eksplisit.

## Asumsi / Risiko

- Asumsi: cron riset + Tavily tetap jalan (prasyarat sesi Artikel pertama).
- Risiko: LLM long-form terpotong → maxTokens 4000 + retry; slug tabrakan → suffix otomatis.
- ~~Risiko: tabel `articles` belum ada di prod sampai migrasi di-apply~~ SELESAI 14 Sep: migrasi applied + terverifikasi (lihat Verifikasi).

## Blocker / Tindak Lanjut

- [x] ~~Apply migrasi `20260913000001` ke prod~~ — DONE 2026-09-14 via MCP `apply_migration`.
- [USER ACTION] Submit sesi riset ☑ Artikel pertama → pantau `/admin/riset` → review → publish → cek `/id/artikel/[slug]` + GSC request indexing.
- Follow-up (belum): cover image artikel dari `content_draft_images`, kategori/tag, RSS; P2/P3 audit lanjutan (FK articles tanpa covering index — pola umum repo, 38 temuan; `articles` double permissive SELECT authenticated — pola standar repo, 18 tabel serupa; SECURITY DEFINER callable anon — pre-existing `advance_research_stage`/`handle_new_user`/`rls_auto_enable`).

## Verifikasi

- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (555 tests / 65 files, termasuk 9 prompt-artikel + 3 helper development + 7 publish-utils + sitemap /id/artikel + /en/articles), `npm run build` ✓ (route artikel SSG terdaftar).
- Commit submodule `4b91d56` pushed, parent `739ea40` pushed.
- Prod 2026-09-14: migrasi applied ✓; `SELECT platforms WHERE slug='artikel'` → 1 baris (Artikel, max_chars NULL, aktif) ✓; 17 kolom `articles` sesuai spek ✓; `content_drafts.article_draft` jsonb ✓; `pg_policies` 2 baris (`articles_public_read` SELECT anon+authenticated `status='published'`; `articles_admin_write` ALL authenticated `is_admin()`) ✓; `articles` 0 baris (kosong, wajar) ✓; advisors security+performance dibaca — tidak ada temuan baru dari migrasi ini.

## Commit

- `feat(artikel): route artikel sebagai platform riset baru untuk SEO` (parent `739ea40` + submodule `4b91d56`)
- (berikutnya) `docs(artikel): catat apply migrasi prod + verifikasi advisors`

## Terkait

- Plan: `plans/2026-09-13-artikel-platform-seo.md`
