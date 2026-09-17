# Automation Ideation — Generate Ide dari Mekanisme Produk

Tanggal: 2026-09-17 17:25 (Asia/Jakarta)

## Tugas / Masalah

Workflow otomatis riset harian tidak punya proses generate ide: `createRun`
memilih produk acak lalu membuat sesi dengan `topic: null`, sehingga discovery
bekerja dari parameter config generik. User meminta tahap ideation —
riset mekanisme produk dulu, lalu generate ide agar parameter riset discovery
lebih lengkap. Keputusan user: (1) LLM + riset mekanisme Tavily, (2) field
penuh — config sebagai hint, ide mempertajam termasuk audience, (3) anti-ulang
via negative examples dari topik produk N hari terakhir.

## File Kunci Diubah

- `src/lib/research/idea.ts` (baru) — `researchProductMechanism` (Tavily 2
  query + best-effort extract URL produk, cap 2000 char), `parseIdeaOutput` /
  `parseIdeaText` (validasi mirror `researchSchema`), `fetchRecentProductTopics`
  (negative examples mekanisme dua, 14 hari, batas 10), `generateSessionIdea`
  (fail-soft → null, tak pernah melempar).
- `src/lib/research/prompts.ts` — `buildIdeaPrompt` + `IdeaInput` (aturan
  anti-halu: tanpa harga fiktif, jangan klaim di luar konteks).
- `src/lib/automation/runner.ts` — `enrichSessionIdea` inline di `createRun`
  + `loadProductDetail`; hasil valid ditulis ke sesi (topic, keywords,
  target_category, audience(+age/interests), target_location, account_goal,
  purpose, tone, cta_style); gagal → perilaku lama + warn log.
- `src/lib/automation/config.ts` — knob `ideaGenerationEnabled` (default
  false, konservatif) + `ideaProductSearch` (default true).
- Migrasi submodule `20260918000004_automation_idea_generation.sql` —
  2 kolom boolean di `automation_configs` (policy RLS existing ikut berlaku).
- UI: `AutomationForms.tsx` (2 checkbox + penjelasan), `actions.ts`
  (persist 2 knob), `admin/automation/page.tsx` (mapping + teks alur).
- Tests: `idea.test.ts` (20), runner +1 (knob mati → topic null),
  config +2 (default pre-migrasi + nilai DB), actions +1 (persist knob).

## Keputusan Teknis / Bisnis

- Fail-soft berlapis: Tavily gagal → LLM-only; LLM gagal/invalid → config
  mentah. Run harian tak pernah gagal karena ideation.
- Config = hint, ide = mempertajam (konsisten tombol manual "Generate Ide").
  Provenance via `config_snapshot` + `content_research_logs` + kill-switch
  granular.
- Inline sinkron di `createRun` (bukan stage pipeline baru): tanpa migrasi
  CHECK status, tanpa ubah state machine, aman dari balapan cron (guard 5 mnt).
- Stage LLM pakai `idea_generation` yang sudah ada di `llm_stage_defaults`.
- Coreksi review: `limit()` hanya di client mock — kode prod tanpa `.limit()`
  (pola `take(10)` di-memory) agar kompatibel tipe mock sesungguhnya;
  `audience_age_fallback` yang tak ada di schema dibuang.

## Asumsi / Risiko

- Extract URL merchant sering diblokir bot → best-effort, snippets search
  biasanya cukup.
- Field penuh = sesi bisa drift dari config; operator kontrol ketat → matikan
  ideation.
- Kualitas ide terbatas cakupan Tavily untuk niche; discovery multi-query
  tetap jaring pengaman.

## Blocker / Belum Selesai

- [x] ~~[USER ACTION] Apply migrasi `20260918000004` ke prod~~ — SELESAI 17:35 via MCP `apply_migration` + verifikasi `information_schema` (2 kolom + default benar; config id=1 ada).
- [USER ACTION] Deploy Vercel → di `/admin/automation` nyalakan "Generate ide dari mekanisme produk" → `Run now` dengan `auto_publish_article=false` → cek log sesi + `search_call_logs` → pantau 1 hari penuh sebelum auto-publish.

## Verifikasi

- `npm run typecheck` ✓, `npm run lint` ✓ (0 error, 0 warning),
  `npm test` 796/796 ✓ (90 files), `npm run build` ✓.
- Pushed: submodule `ef755e4`, parent `6592c5c`.

## Commit

- `feat(automation): tahap ideation riset mekanisme produk sebelum discovery`
- Plan: `plans/2026-09-17-automation-idea-generation.md`
