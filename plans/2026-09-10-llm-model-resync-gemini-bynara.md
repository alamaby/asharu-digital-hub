# Resync Model Gemini + Bynara + Reasoning Configurable by Table

Created: 2026-09-10 08:36:00

## Objective
Samakan `llm_models` dengan 2 list user: 5 model Gemini aktif dan 6 model Bynara (slug DB `naraya`) aktif; semua model di luar list di-disable via `is_active=false`. Perluas `GeminiProvider` agar `reasoning_effort` + knob lain (`thinking_budget`, `thinking_level`, `temperature`, `max_tokens`) dibaca dari `llm_models.config` (configurable by table) via modul murni baru `model-config.ts` + UI admin.

## Scope
- In: 1 migrasi SQL resync, `types.ts`/`model-config.ts`/`completion.ts`/`gemini.ts`, action `updateModelConfig` + `ModelBoard`, test mapping, verifikasi SELECT, gate, entry `.memory/`.
- Out: ubah `llm_providers`, keys/Vault, `llm_stage_defaults`, model OpenRouter/Cloudflare, provider openai-compatible/cloudflare.

## Milestones
1. File plan ini
2. Migrasi `20260910000001_llm_models_gemini_bynara.sql` (submodule, applied prod via MCP)
3. Perluasan reasoning configurable (`model-config.ts` + 3 jalur completion + `thinkingConfig` Gemini)
4. Admin UI config-by-table + test + gate hijau + memory + commit/push

## Tasks
- [x] Tulis file plan ini
- [x] Migrasi — Gemini upsert 5 (priority 10..50 urutan tulis, aktif, reasoning max)
- [x] Migrasi — disable model gemini di luar 5 list
- [x] Migrasi — Naraya upsert 6 (priority 10..60 urutan tulis, aktif, reasoning max)
- [x] Migrasi — disable model naraya di luar 6 list
- [x] `types.ts` — `ChatInput` tambah `thinkingBudget`/`thinkingLevel`
- [x] `model-config.ts` (baru) — `resolveModelParams` (4 level effort + thinking_budget/level + temperature + max_tokens, tervalidasi) + `buildThinkingConfig` (level > budget > mapping effort)
- [x] `completion.ts` — 3 jalur (waterfall/pinned/hint) pakai `resolveModelParams`; config jadi fallback bila input null
- [x] `gemini.ts` — kirim `generationConfig.thinkingConfig` bila ada; tanpa effort = tidak kirim
- [x] Admin — `updateModelConfig` generik (merge jsonb + validasi range) + `ModelBoard` select effort + input budget/temperature/max_tokens
- [x] Test `model-config.test.ts` + `gemini.test.ts` (body thinkingConfig)
- [x] Verifikasi SELECT + gate (typecheck/lint/test) + memory entry + commit submodule dulu lalu parent + push

## Risks
- Bentuk `thinkingConfig` Gemini 3.x (`thinkingLevel` MINIMAL/LOW/MEDIUM/HIGH) vs 2.5 (`thinkingBudget`) belum tervalidasi live (docs fetch gagal transport error) → desain kirim SATU key saja (prioritas `thinking_level` eksplisit > `thinking_budget` eksplisit > mapping effort→level); verifikasi 1 call per model pasca-deploy, waterfall tetap jadi jaring pengaman.
- Knob bebas di tabel = admin bisa salah set (budget besar → lambat/mahal). Mitigasi: default mapping aman + validasi range di action + placeholder contoh di UI.
- ID dipakai as-is (konfirmasi user) belum validasi ke `GET /v1/models` → risiko 404 cascade. Mitigasi: timeout per-model + log `http_status` + toggle UI.
- Trade-off: non-DELETE menyimpan histori `llm_call_logs` + FK stage aman, tapi baris mati menumpuk — diterima (Non-Destructive Migrations).

## Progress Log
- 2026-09-10 08:36:00 — Plan dibuat. Konfirmasi user: (1) perluas gemini.ts, (2) priority = urutan tulis, (3) ID as-is; reasoning effort + lainnya configurable by table.
- 2026-09-10 09:00:00 — Eksekusi selesai. Migrasi `20260910000001_llm_models_gemini_bynara.sql` applied prod: 5 gemini aktif (10–50), 6 naraya aktif (10–60), sisanya nonaktif; stage defaults NULL (aman). Runtime: `model-config.ts` baru + `chatInputFor` di 3 jalur + `thinkingConfig` Gemini. Admin: `updateModelConfig` + ModelBoard form per-model. Gate hijau: 346 tests ✓, typecheck ✓, lint ✓.

## Notes
- Bynara = slug DB `naraya` (`router.bynara.id`); UI tampilkan "Bynara (Naraya Router)".
- ID tanpa prefix untuk `naraya`/`gemini` (strip `gemini/` di `gemini.ts:15`).
- Skala kecil → TOGAF tidak dipaksakan penuh (§3 AGENTS.md); cukup migrasi non-destruktif + DB-as-Code.
- Pola SQL ikut `20260905000004_llm_models_resync.sql` (`ON CONFLICT ... DO UPDATE`).
