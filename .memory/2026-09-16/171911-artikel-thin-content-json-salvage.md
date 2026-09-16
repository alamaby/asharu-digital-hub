# Artikel Thin 505 Kata — JSON Salvage + Thin Gate Automation

Task: RCA + fix draf otomasi `87b9fdc1` (505 kata, cover `selected` tapi run `failed` di publishing).

## Key files changed

- `src/lib/llm/prompt.ts` — `repairArticleJson()` baru + `parseArticleDraft` memakainya; aturan "JSON HARUS VALID" di `buildArticlePrompt` + `buildArticleExpandPrompt`.
- `src/lib/llm/prompt-article.test.ts` — 4 test baru (salvage kolaps section, trailing comma, repair valid/sampah).
- `src/lib/research/development.ts` — thin-repair 1x → 2x (retry temp 0.3 + reminder JSON valid).
- `src/lib/automation/runner.ts` — fail-fast `thin_content` sebelum cover/publish; `loadDrafts` bawa `llm_meta`.
- `src/lib/automation/runner.test.ts` — 2 test baru (thin fail-fast, non-thin lanjut cover).
- `plans/2026-09-16-artikel-87b9fdc1-thin-content-rca-fix.md` — plan + progress.

## Decisions

- Repair konservatif: versi repair hanya menang bila sections lebih banyak; hasil tetap divalidasi `parseArticleLang`. Tanpa dependency baru.
- `ARTICLE_MIN_WORDS` tetap 600; FAQ tetap tidak dihitung — standar anti-thin tidak dilonggarkan.
- Runner tidak auto-expand ulang (development sudah repair 2x); gagal cepat dengan pesan menunjuk `/konten/review/[id]`.
- Fase 2b dibatalkan sebagai perubahan: pin model expand sudah dihormati `resolveStageModel` override.

## Assumptions / risks

- Pola `","h2":` diasumsikan selalu cacat (bukan literal isi body); risiko false-positive minimal karena repair hanya menang bila sections bertambah.
- Expand manual user (827 kata, published 09:33 UTC) terjadi di luar kode ini — fix kode berlaku untuk run berikutnya setelah deploy.

## Verification

- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 698/698 ✓, `npm run build` ✓.
- Artikel live terverifikasi via DB: `articles.ac246151` published + cover, body 869 kata.

## Commit proposal

`fix(artikel): salvage JSON section kolaps + retry thin-repair + gate thin automation`

## Related

- Plan: `plans/2026-09-16-artikel-87b9fdc1-thin-content-rca-fix.md`
- Insiden pola sama: `.memory/2026-09-14/144500-review-artikel-419a2dc8-fix.md`
