# Redesign 3 panel detail riset (log + performa + parameter)

- Task: user minta (1) Log riset: clamp 3 baris + expand + sorting + pagination; (2) Performa LLM & Search: diagram/chart + data token in/out; (3) Parameter Riset: tampilan lebih menarik.
- Root cause: panel lama = list 100 log tanpa paging (`message.slice(0,600)` penuh), performa = baris teks `p:.. c:.. t:..`, parameter = satu `<dl>` 19 baris teks/angka.
- Key files: `src/lib/research/perf-summary.ts` (baru, agregasi murni + formatCompact + 5 tests) + `.test.ts`; `src/components/admin/ResearchLogItem.tsx` (baru, client clamp+toggle, 2 tests); `src/components/admin/ResearchPerfCharts.tsx` (baru, RSC: KPI cards + stacked-bar token + donut status + bar latensi + bar hasil/query + sr-only table); `src/components/admin/ResearchParams.tsx` (baru, RSC 3 kartu grup lucide + chips + badge + hide-empty + hitungan); `riset/[sessionId]/page.tsx` (searchParams logPage/logSort/logLevel/logStage, count+range 10, limit LLM/search 10→30, toolbar GET, Prev/Next + anchor #logs, details per-call); `id+en.json` (+28 keys paritas).
- Decisions: chart SVG/CSS buatan sendiri (tanpa recharts, hemat ~100KB+); paginasi server via searchParams (konsisten /admin/llm/logs); kartu grup + badge (bukan accordion); filter stage log = opsi dari halaman berjalan (tanpa query tambahan); label chart hardcode id di komponen? TIDAK — semua via props labels (i18n server).
- Risks: limit 30 menambah payload RSC — diterima (cap 30, agregasi server). Paginasi reload halaman — mitigasi anchor #logs. Hide-empty sembunyikan info — mitigasi hitungan "n field kosong disembunyikan".
- Blockers: verifikasi browser live di-skip (sesi shell terisolasi, dev server tidak persist; `chrome-error://chromewebdata`); diganti build production sukses.
- Verification: `typecheck` ✓, `lint` ✓, `307/307` tests ✓ (7 baru: 5 perf-summary + 2 LogItem; messages parity ✓), `next build` ✓ (riset/[sessionId] 4.87 kB).
- Commit proposal: `feat(research): redesign detail panels logs perf params`
- Related: `plans/2026-09-07-riset-detail-panels-redesign.md`.
