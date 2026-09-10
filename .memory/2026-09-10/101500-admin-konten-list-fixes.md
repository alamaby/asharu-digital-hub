# Admin Konten List Fixes — 5 masalah screenshot

Tanggal: 2026-09-10 10:15 (local). Plan: `plans/2026-09-10-admin-konten-list-fixes.md`.

## Masalah (dari screenshot user)
1. Baris teratas = request 31 Agu padahal ada draft 09 Sep → 2 query terpisah (`requests` lalu `drafts`), masing-masing paginasi sendiri; render blok requests dulu.
2. Banyak Topik/Platform/Kategori `—` → draft riset (`request_id` = UUID sesi, bukan `content_requests.id` sejak migrasi `20260902000002`) di-lookup ke `content_requests` → miss → `request=null`; kolom `research_topic_id/platform_slug` tidak di-SELECT.
3. Sorting dari dropdown `Urutkan` tersendiri → ganti klik header kolom (asc/desc).
4. Label mentah `admin.konten.pageOf` → `t('pageOf',{page})` tanpa `{total}` (next-intl MISSING_PARAMETER) + hardcode `dari`.
5. Filter Platform single-select → multi-select.

## File diubah
- `src/lib/admin/konten-list.ts` (baru) + `konten-list.test.ts` (10 tests): `normalizeKontenSort` (termasuk legacy `newest|oldest`), `parsePlatformParam`, `sortKontenItems` + tie-break, `paginateKonten`.
- `src/app/[locale]/admin/konten/page.tsx` (tulis ulang): SELECT draft +`research_topic_id,platform_slug`; resolve topik 3 lapis (legacy → `content_research_topics` → `content_research_sessions`); filter platform `.in()` ke requests + in-memory ke drafts; merge-sort gabungan + slice 20.
- `src/components/admin/KontenList.tsx` (tulis ulang): 1 tabel gabungan + sortable `<th><button>` (`aria-sort`, ▲/▼), dropdown checkbox platform (Pilih semua/Hapus, `?platform=a,b`), `pageOf{page,total}` + `rangeInfo`, mobile card ikut item gabungan.
- `src/messages/id.json` + `en.json`: tambah `sortBy, platformCountHint, platformSelectAll, platformClear, rangeInfo`; hapus `sortLabel/sortNewest/sortOldest`.

## Keputusan
- Merge-sort in-memory (bukan UNION DB): sort kolom join draft (topik/kategori/provider) hanya bisa in-memory; terima untuk <1k rows (saat ini 99).
- Fetch draft tanpa `.range()` (limit default Supabase 1000); requests difilter di DB, drafts in-memory (platform di `platform_slug` ATAU `llm_meta.platform`).
- Sort/paginasi pakai filter terapan (`filters.platform`), bukan state checkbox sementara; state checkbox di-sync via `useEffect` setelah navigasi.
- Standar C2M/TM Forum tidak relevan — murni bugfix list, tanpa perubahan skema.

## Asumsi / risiko
- `target_category` NULL → `—` by-design (kolom nullable).
- Draft tanpa kedua link tetap `—` (by design `drafts_has_link`).
- Revisi paginasi DB bila rows >1k.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 356/356 (47 files, termasuk parity ID/EN) ✓.
- Belum QA manual di browser (klik header, multi-select, mobile) — disarankan sebelum tutup.

## Commit
- `fix(admin): gabung list konten + sortable header + multi-select platform`
