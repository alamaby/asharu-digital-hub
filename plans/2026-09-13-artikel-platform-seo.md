# Artikel sebagai Platform Riset Baru (SEO)

Created: 2026-09-13 15:30:00

## Objective

Tambahkan `artikel` sebagai pilihan platform di sesi riset. Jika konten review untuk artikel disetujui, sistem menambahkan postingan baru ke artikel sesuai bahasa (id/en). Tujuan utama: meningkatkan SEO website via konten long-form yang ter-index di domain sendiri.

Keputusan user (13 Sep): URL `/id/artikel/[slug]` + `/en/articles/[slug]`, tabel `articles` baru saat approve, `language=both` → 2 postingan, long-form SEO standar (800–1500 kata, H1/H2, FAQ, 1–2 sisipan afiliasi + disclosure).

## Scope

- Migrasi DB (submodule `supabase/`): seed platform `artikel` + tabel `articles` + kolom `content_drafts.article_draft` + RLS.
- Pipeline riset: `buildArticlePrompt` + cabang `artikel` di `runDevelopment` (tanpa audit panjang/emoji thread).
- Review: kartu draf artikel + aksi approve→publish per bahasa.
- Route publik: list + detail `/artikel` ↔ `/articles`, metadata + JSON-LD + sitemap + middleware whitelist + i18n.
- Test + gate hijau + commit submodule dulu lalu parent + push.

Keluar dari scope: komentar, multi-author, tag/kategori, RSS, auto-post medsos, backfill dari draf thread lama.

## Milestones

1. DB + platform seed
2. Pipeline riset artikel
3. Review → publish
4. Route publik + SEO
5. Gate + commit + push

## Tasks

- [x] Plan file + investigasi kode
- [x] Migrasi `20260913000001_artikel_platform.sql` (submodule): platform + tabel + RLS
- [x] `src/lib/llm/prompt.ts`: `buildArticlePrompt`, `parseArticleDraft`, `countArticleWords` + test
- [x] `src/lib/research/development.ts`: cabang artikel + test
- [x] `src/lib/articles/`: types, `approveArticleAndPublish`, public fetch + test
- [x] `ArticleDraftCard` + cabang di `ContentDraftCard` + snippet list + detail page
- [x] `routing.ts`, `middleware.ts`, halaman publik list/detail, `articleSchema` JSON-LD, `sitemap.ts`, messages, nav
- [x] Gate (`typecheck`, `lint`, `test` 555, `build`) hijau

## Risks

- Output LLM long-form terpotong → `maxTokens` 3500–4000 + 1x retry + validasi jumlah kata minimum (gagal eksplisit, bukan sunyi).
- Slug tabrakan → unique per `(locale, slug)` + suffix otomatis + idempoten per `(draft_id, locale)`.
- Afiliasi hard-sell merusak E-E-A-T → maks 2 sisipan inline + disclosure di halaman.
- Halaman tipis lolos index → tolak publish bila <600 kata dengan pesan jelas.
- Migrasi hanya di-commit, apply ke prod via pipeline/user (linkungan MCP read-only untuk DDL).

## Progress Log

- 2026-09-13 15:30:00 — Plan dibuat (Plan Mode), dikonfirmasi 4 keputusan desain via question tool.
- 2026-09-13 15:45:00 — Build Mode aktif, investigasi selesai, mulai implementasi.
- 2026-09-13 21:40:00 — Implementasi selesai: migrasi + pipeline + review/publish + route publik/SEO. Gate hijau (typecheck, lint, 555 tests/65 files, build; sitemap test verifikasi /id/artikel + /en/articles). Siap commit submodule → parent → push. Follow-up: apply migrasi ke prod [USER ACTION], seed/pantau sesi riset Artikel pertama, GSC request indexing.

## Notes

- Proporsionalitas standar (§3 AGENTS): fitur kecil → tanpa seremoni TOGAF penuh; yang dipakai: non-destructive migration, RLS ketat, RSC/SSG publik.
- Trade-off tabel baru vs reuse `content_drafts`: tabel baru memberi slug stabil + histori + sitemap `lastModified`; biaya satu tabel kecil diterima.
- Trade-off 2 postingan vs 1 dwibahasa: kanonis + hreflang bersih per locale; risiko duplikasi topik dimitigasi konten yang benar-benar dilokalkan + hreflang silang.
- Draf artikel tetap simpan `generated_thread` minimal yang valid (main=judul/excerpt, replies=[]) agar CHECK `thread_shape` + list review lama tidak pecah; konten penuh di `article_draft`.
