# Redesign 3 Panel Detail Riset

Created: 2026-09-07 12:05:00

## Objective
Percantik dan mudahkan baca 3 panel di `/admin/riset/[sessionId]`: Log riset (collapse 3-baris + sorting + pagination), Performa LLM & Search (chart SVG/CSS + ringkasan token), Parameter Riset (kartu grup + badge). Tanpa library chart baru, tanpa migrasi.

## Scope
- Hanya halaman `src/app/[locale]/admin/riset/[sessionId]/page.tsx` + komponen admin baru + helper agregasi murni + keys i18n `admin.research`.
- Query log naik 100 (tetap, tapi paginasi 10/halaman); `llm_call_logs` + `search_call_logs` naik 10 → 30 untuk chart bermakna.
- Tidak menyentuh pipeline/orchestrator/scoring.

## Milestones
1. Log riset: paginasi + sorting server, clamp 3-baris + expand.
2. Performa: helper agregasi + chart SVG/CSS + KPI cards.
3. Parameter: kartu grup ber-ikon + chips/badge + hide-empty.
4. i18n + tests + gate + commit.

## Tasks
- [x] 1a. Log — query server: searchParams (logPage, logSort, logLevel, logStage), count exact + range PAGE_SIZE 10, anchor #logs
- [x] 1b. Log — toolbar filter GET + Prev/Next server
- [x] 1c. Log — ResearchLogItem client (line-clamp-3 + expand/collapse, aria-expanded)
- [x] 2a. Performa — perf-summary.ts murni + unit test
- [x] 2b+2c. Performa — ResearchPerfCharts RSC (KPI cards + stacked bar token + donut status + bar latensi + bar hasil/query, sr-only table fallback)
- [x] 2d. Performa — details per call tetap ada + link log lengkap
- [x] 3a+3b. Parameter — ResearchParams RSC (3 kartu grup, chips, badge, hide-empty + hitungan)
- [x] 4. i18n keys id+en paritas
- [x] 5. Gate typecheck/lint/test + memory + commit-push

## Risks
- Limit 10 → 30 menambah payload RSC; mitigasi: cap 30, agregasi server, chart CSS ringan.
- Tanpa recharts: hemat ~100KB+ bundle; trade-off tanpa hover-zoom interaktif — diterima (data ≤30 baris).
- Paginasi server reload halaman; mitigasi anchor #logs + pola konsisten /admin/llm/logs.
- Hide-empty bisa sembunyikan info "belum diisi"; mitigasi: tampilkan hitungan disembunyikan.

## Progress Log
- 2026-09-07 12:05:00 — Rencana disusun (plan mode); pilihan: chart SVG/CSS, paginasi server, kartu grup.
- 2026-09-07 12:10:00 — Build mode aktif, eksekusi dimulai.
- 2026-09-07 12:55:00 — SELESAI: gate hijau (typecheck/lint/307 tests incl. 7 baru), build production sukses (riset/[sessionId] 4.87 kB). Verifikasi browser live di-skip (dev server tidak persist di sesi shell terisolasi).

## Notes
- Keputusan desain via question tool: SVG/CSS buatan sendiri; paginasi server via searchParams; kartu grup + badge.
- Contoh tampilan Performa: KPI cards → stacked bar token/call → donut status → bar latensi → bar hasil/query → details per call.
