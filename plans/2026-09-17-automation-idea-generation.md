# Tahap Ideation di Workflow Otomatis (Automation Riset Harian)

Created: 2026-09-17 17:01:41

## Objective

Menambah tahap "generate ide" ke workflow otomatis riset harian: sebelum sesi riset dibuat, sistem meriset mekanisme produk terpilih via Tavily lalu LLM menghasilkan ide (topic, keywords, kategori, audience, dst) sehingga parameter riset untuk discovery lebih lengkap — bukan lagi `topic: null` generik.

Keputusan user (17 Sep): (1) LLM + riset mekanisme Tavily, (2) field penuh — config sebagai hint, ide mempertajam termasuk audience, (3) anti-ulang via negative examples dari topik produk N hari terakhir.

## Scope

- `src/lib/research/idea.ts` (baru): riset mekanisme produk + generate ide + anti-ulang
- `src/lib/research/prompts.ts`: `buildIdeaPrompt`
- `src/lib/automation/runner.ts` + `config.ts`: enrichment inline fail-soft di `createRun`
- Migrasi submodule: 2 kolom knob di `automation_configs`
- UI `/admin/automation`: 2 checkbox + validasi; teks alur diperbarui
- Unit tests: idea, runner, config

## Milestones

1. Modul idea + prompt selesai + unit test hijau
2. Integrasi runner + config + migrasi applied lokal
3. UI admin selesai
4. Gate penuh hijau → commit + push (submodule dulu, baru parent)

## Tasks

- [x] Modul `src/lib/research/idea.ts` + `buildIdeaPrompt` + tests
- [x] Integrasi `createRun` (runner.ts) + knob config (config.ts) + tests
- [x] Migrasi submodule applied (dev) — prod oleh user
- [x] UI admin automation (forms + actions + page)
- [x] Gate: typecheck + lint + test + build
- [ ] Commit + push submodule → parent; update memory

## Risks

- Extract URL merchant (Tokopedia/Shopee) sering diblokir bot → best-effort, bukan gate; search snippets biasanya cukup.
- Output LLM non-JSON/invalid → fail-soft ke perilaku lama; run harian tak pernah gagal karena ideation.
- Pilihan "field penuh" mengurangi determinisme operator: sesi bisa drift dari config snapshot. Terkendali via `config_snapshot` + `content_research_logs` + kill-switch granular `idea_generation_enabled=false`.
- Kualitas ide terbatas cakupan Tavily untuk produk niche — discovery multi-query tetap jaring pengaman.
- Re-run LLM untuk sesi automation dari produk sama di hari berbeda: variety seed + negative examples mengurangi duplikasi, tidak menjamin unik.

## Progress Log

- 2026-09-17 17:01:41 — Plan dibuat; eksekusi dimulai (mode build).
- 2026-09-17 17:20 — Implementasi selesai; gate hijau (typecheck ✓, lint ✓, 796 tests ✓, build ✓). Siap commit.
- 2026-09-17 17:25 — Pushed: submodule `ef755e4` + parent `6592c5c`. [USER ACTION] apply migrasi prod → Run now dry-run.
- 2026-09-17 17:35 — Migrasi applied ke PROD via MCP (`automation_idea_generation` sukses) + terverifikasi via `information_schema`: `idea_generation_enabled boolean DEFAULT false`, `idea_product_search boolean DEFAULT true`; baris config id=1 ada (`is_enabled=true`). Sisa user: deploy Vercel → Run now dry-run → pantau 1 hari.

## Notes

- Konsisten pola existing: prompt riset di `prompts.ts`; fail-soft best-effort seperti logging runner; validasi output mirror `researchSchema` di `actions.ts`.
- Stage LLM pakai `idea_generation` yang sudah ada di `llm_stage_defaults` (dipakai tombol manual).
- Balapan cron aman: enrichment inline sinkron di `createRun`; guard 5 mnt `advancePendingSessions` mencegah sesi baru dipungut prematur.
- [USER ACTION pasca-deploy] Apply migrasi prod → `Run now` dengan `auto_publish_article=false` → cek log sesi + `search_call_logs` → pantau 1 hari.
