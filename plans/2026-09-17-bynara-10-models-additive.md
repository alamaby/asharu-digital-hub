# Tambah 10 Model Bynara (naraya) — Additive, Reasoning Max

Created: 2026-09-17 15:33:00

## Objective
Tambahkan 10 model LLM baru untuk provider Bynara (slug DB `naraya`, `router.bynara.id`)
ke `llm_models`, semua `reasoning_effort=max`. Additive saja — model aktif lama tetap aktif.

## Scope
- In: 1 migrasi SQL non-destruktif di submodule + apply prod + verifikasi + gate + commit/push + memory.
- Out: perubahan kode runtime (`reasoning_effort` sudah diteruskan otomatis via
  `model-config.ts` → `openai-compatible.ts:19`), disable model lama, provider lain.

## Milestones
1. Migrasi file + apply prod
2. Gate hijau + commit/push (submodule → parent)
3. Memory + plan file

## Tasks
- [x] Migrasi `supabase/migrations/20260918000003_llm_models_by_nara_additive.sql`
- [x] Apply prod via MCP (success:true)
- [x] Verifikasi SELECT 10/10 model aktif + advisors (hanya pre-existing)
- [x] Gate: typecheck ✓, lint ✓, 767 tests ✓
- [x] Commit submodule `3526672` lalu parent + push
- [x] Plan file + memory entry + README index

## Risks
- ID model belum divalidasi ke `GET /v1/models` router → risiko 404 per model; mitigasi waterfall + smoke test opsional.
- `reasoning max` pada model free/lightning bisa ditolak gateway; knob bisa diubah dari admin tanpa migrasi.
- Additive: model lama tetap kandidat; bila sudah tak tersedia di router akan 404 lalu fallback.

## Progress Log
- 2026-09-17 15:33:00 — Eksekusi selesai. Migrasi applied prod; 10/10 model aktif
  priority 200–290; gate hijau; submodule `3526672` pushed; parent commit menyusul.

## Notes
- Konfirmasi user: (1) additive tanpa disable model lama; (2) `nemotron-3-ultra-free`
  model berbeda dari `nemotron-3-ultra` lama (dibiarkan nonaktif).
- 10 model: atria-dawn, ling-3.0-flash-fin-free (reaktivasi), ling-3.0-flash-sante-free,
  ling-3.0-flash-vl-free, nemotron-3-super-free, nemotron-3-ultra-free,
  nemotron-3.5-lightning-free (reaktivasi), union-alpha, glm-5.3-flash, gpt-5.6-luna.
- Pola SQL ikut `20260910000001_llm_models_gemini_bynara.sql` tanpa blok disable.
