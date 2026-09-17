# Tambah 10 Model Bynara (naraya) — Additive, Reasoning Max

Task: user minta tambah 10 model LLM untuk provider Bynara (slug DB `naraya`)
dengan reasoning effort max: atria-dawn, ling-3.0-flash-fin-free,
ling-3.0-flash-sante-free, ling-3.0-flash-vl-free, nemotron-3-super-free,
nemotron-3-ultra-free, nemotron-3.5-lightning-free, union-alpha, glm-5.3-flash,
gpt-5.6-luna.

Key files:
- `supabase/migrations/20260918000003_llm_models_by_nara_additive.sql` (baru,
  submodule, applied prod via MCP) — INSERT..ON CONFLICT DO UPDATE 10 model
  priority 200–290, config `{"reasoning":true,"reasoning_effort":"max"}`,
  tanpa statement disable (additive).
- `plans/2026-09-17-bynara-10-models-additive.md` (baru) — plan file §7.

Keputusan teknis/bisnis:
- Konfirmasi user: ADDITIVE (model aktif lama agnes/laguna/longcat/stepfun
  tetap aktif, tidak di-disable) — berbeda dari pola resync 2026-09-05/09-10.
- `nemotron-3-ultra-free` dikonfirmasi user sebagai model BERBEDA dari baris
  lama `nemotron-3-ultra` (nonaktif) — baris lama tidak disentuh.
- Tanpa perubahan kode: `reasoning_effort` dari `llm_models.config` sudah
  diteruskan runtime via `src/lib/llm/model-config.ts` +
  `src/lib/llm/providers/openai-compatible.ts:19`.
- Priority 200–290 (di bawah semua existing naraya max 160) menghindari
  konflik urutan dan menempatkan model baru sebagai kandidat berikutnya.

Asumsi/risiko:
- ID belum divalidasi ke `GET /v1/models` router — salah karakter = 404 model
  itu; waterfall + fallback menutup. Smoke test per model disarankan.
- `reasoning max` untuk model free bisa dibatasi gateway; knob per-model bisa
  diubah dari admin tanpa migrasi.

Blockers: tidak ada.

Verifikasi: SELECT prod 10/10 model aktif config max; advisors security hanya
pre-existing; gate hijau (typecheck ✓, lint ✓, 767 tests ✓).

Commit proposal: `feat(db): tambah 10 model bynara reasoning max additive`

Related: `plans/2026-09-17-bynara-10-models-additive.md`,
`plans/2026-09-10-llm-model-resync-gemini-bynara.md` (pola SQL),
`plans/2026-09-17-ciora-llm-provider-plan.md` (provider terdepan).
