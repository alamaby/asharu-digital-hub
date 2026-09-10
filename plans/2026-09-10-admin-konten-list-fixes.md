# Admin Konten List Fixes

Created: 2026-09-10 10:00:00

## Objective
Perbaiki 5 masalah di `/id/admin/konten`: urutan tanggal terbalik, kolom kosong (—), sorting klik-header, label `admin.konten.pageOf` mentah, filter Platform multi-select.

## Scope
- `src/app/[locale]/admin/konten/page.tsx` (query + merge + paginasi gabungan)
- `src/components/admin/KontenList.tsx` (sortable header, multi-select platform, i18n)
- `src/messages/id.json`, `src/messages/en.json` (key baru + paritas)
- Helper murni + unit test (sort/parse)

## Milestones
1. Query gabungan + topik riset terisi
2. Sortable header + hapus dropdown Urutkan
3. Multi-select platform + i18n benar

## Tasks
- [x] Query: SELECT draft tambah `research_topic_id, platform_slug`; lookup `content_requests` + `content_research_topics`; filter platform (multi) ke dua tabel
- [x] Paginasi gabungan: fetch tersaring → merge-sort in-memory → slice 20; `totalCount` gabungan
- [x] Sorting klik-header (`sort` + `dir`, `aria-sort`, indikator ▲/▼), hapus field Urutkan tersendiri; backward-compat `sort=newest|oldest`
- [x] I18n: `t('pageOf',{page,total})` + key `rangeInfo`; hapus hardcode `dari`
- [x] Filter Platform multi-select (checkbox + Pilih semua/Hapus, URL `?platform=a,b`)
- [x] Helper murni + test; gate `typecheck/lint/test` hijau

## Risks
- Merge in-memory tidak scalable ke puluhan ribu rows — terima untuk <1k rows (saat ini 99); revisi bila tumbuh.
- Draft tanpa kedua link tetap `—` (by design `drafts_has_link`).
- Tidak ada komponen `MultiSelect` generik di repo — buat khusus tabel ini dulu.
- Sort kolom join (topik/kategori/provider draft) hanya bisa in-memory, bukan `.order()` DB.

## Progress Log
- 2026-09-10 10:00:00 — Plan dibuat; investigasi selesai (2 query terpisah, lookup ID-mismatch sesi vs request, param pageOf kurang, belum ada sortable/multi-select di repo).
- 2026-09-10 10:15:00 — SELESAI & gate hijau (typecheck/lint/356 tests). File baru `src/lib/admin/konten-list.ts` (+10 tests); tulis ulang `page.tsx` + `KontenList.tsx`; key i18n baru ID/EN (`sortBy, platformCountHint, platformSelectAll, platformClear, rangeInfo`), hapus `sortLabel/sortNewest/sortOldest`. Catatan: fetch draft tanpa `.range()` (andalkan limit default Supabase 1000; OK untuk 99 rows, revisi bila >1k); kolom join draft hanya sortable in-memory.

## Notes
- Standar domain (C2M/TM Forum) tidak relevan untuk bugfix list admin ini — murni perbaikan query/render/i18n, tanpa perubahan skema.
- Keputusan user: ikut rekomendasi (gabung 1 tabel terurut, semua 6 kolom sortable, dropdown checkbox).
