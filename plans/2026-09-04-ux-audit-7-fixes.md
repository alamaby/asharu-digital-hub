# UX Audit 7 Fixes — Form, Riset, Nav & Log

Created: 2026-09-04

## Objective
Perbaiki 7 temuan UX/fungsional: (1) advanced kosong blokir submit, (2) detail riset hilangkan input, (3) Dashboard selalu active, (4) list riset ambigu + tanpa filter, (5) Tinjau Draf tanpa filter + tanpa admin nav, (6) LLM Logs incomplete/sorting/nav posisi, (7) konten/review tanpa admin nav.

## Scope
- In: Header/NavMenu/MobileNav, admin/layout + AdminTopBar, konten/baru/page + ContentRequestForm, lib/content/actions (normalize + enum kategori + generateIdea), messages, category dynamic fetch, llm pool, riset detail/list, review, llm logs.
- Out: Tavily integration for idea (future), DB category enum constraint.

## Milestones
1. Fix blocker form & nav active (1,3)
2. Detail fields migrasi + riset/logs filter (2,4,6)
3. Tinjau filter + admin nav (5,7) + i18n

## Tasks
- [x] `actions.ts:136` normalize numerik `""→undefined` + generateIdea 30/jam all fields, `ContentRequestForm` controlled + dynamic categories DISTINCT + Generate Idea ✦
- [x] Migrasi `20260904000002_research_detail_fields.sql` tambah 8 kolom riset (topic/language/target_category/audience/cta_style/purpose/constraints/keywords), update `actions.ts:212` insert, detail page SELECT+render header+dl (topic/language/audience/cta/purpose/constraints/keywords), applied to asharu-be-production
- [x] `AdminTopBar.tsx:14` fix active exact untuk `/admin` (isDashboard check)
- [x] `admin/riset/page.tsx` + `ResearchListClient.tsx` filter/sorting/pagination (status/platform/date/sort, PAGE_SIZE 20, topic display, count)
- [x] `konten/review/page.tsx` filter/pagination (status/provider/platform/date/sort PAGE_SIZE 12) + `AdminTopBar` + `ReviewListClient.tsx` inline card (tanpa DraftListCard server), tambah `provider+platform` sesuai konfirmasi
- [x] `admin/llm/logs/page.tsx` NULL-safe filter `or(is.null,neq)`, sort `created_at/latency/provider` + dir, split Request/Response pretty, nav kiri `← Providers`, pagination include sort, `admin/llm/page.tsx` tetap
- [x] `admin/layout.tsx` secondary bar, `Header/MobileNav/NavMenu` pisah public/admin, `id/en.json` nav.adminLlm + form generateIdea

## Risks
- Migrasi tambah kolom nullable aman — tidak pecah existing 50+ rows; tapi `topic` lama null → detail tampil `-`.
- `konten/review` filter butuh join `content_requests` untuk `platform` — gunakan `content_research_sessions.platform_slug` saat ada `research_topic_id`, fallback `draft.llm_meta`.

## Progress Log
- 2026-09-04 — Plan 7 fixes dibuat read-only, konfirmasi ya/tambah provider+platform/tetap, build aktif mulai eksekusi.
- 2026-09-04 — Fix #1 normalize numerik done, #3 AdminTopBar exact done, #2 migrasi research_detail_fields pushed (696d811) + detail render, #4 ResearchListClient filter/pagination done, #5+7 ReviewListClient + AdminTopBar di konten/review, #6 LLM logs split + sort + NULL fix. Gate: typecheck ✓ lint ✓ 240 tests ✓ build ✓.

## Notes
- Konfirmasi: (1) ya filter riset `status+platform+date+sort`, (2) tambah provider+platform di Tinjau, (3) logs sorting tetap `created_at desc`.
