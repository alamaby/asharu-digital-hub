# Resync Model Bynara + OpenRouter + Cloudflare

Created: 2026-09-05 11:00:00

## Objective
Samakan `llm_models` dengan 3 list user: 7 model Bynara (slug `naraya`) aktif, 9 model OpenRouter aktif, dan 10 model Cloudflare unik aktif; semua model di luar list di-disable via `is_active=false` (non-destruktif, tanpa DELETE).

## Scope
- In: 2 migrasi SQL resync, verifikasi SELECT, gate (test/typecheck/lint/build), entry `.memory/`.
- Out: ubah kode provider/UI (runtime sudah DB-driven via `registry.ts` + `fetchOrderedModels`), ubah `llm_providers`, keys/Vault, `llm_stage_defaults`.

## Milestones
1. File plan ini
2. Migrasi `20260905000004_llm_models_resync.sql` (naraya + openrouter)
3. Migrasi `20260905000005_llm_models_cloudflare.sql` (cloudflare, 10 unik setelah dedup 3 duplikat)
4. Verifikasi + gate hijau + memory entry

## Tasks
- [x] Tulis file plan ini
- [x] Migrasi — Naraya upsert 7 (priority 10..70 sesuai urutan tulis, aktif, reasoning max semua)
- [x] Migrasi — disable model naraya di luar 7 list
- [x] Migrasi — OpenRouter upsert 9 (priority 10..90 sesuai urutan tulis, aktif; reasoning max hanya nano-reasoning)
- [x] Migrasi — disable model openrouter di luar 9 list
- [x] Migrasi — Cloudflare upsert 10 unik (priority 10..100 sesuai urutan tulis, aktif, reasoning false semua karena `cloudflare.ts` tidak forward `reasoning_effort`)
- [x] Migrasi — disable model cloudflare di luar 10 list (`llama-3.1-8b`)
- [x] Verifikasi SELECT + gate + memory entry

## Risks
- ID `laguna-s-2.1`/`longcat-2.0-free`/`muse-spark-1.2-contributor-free` dipakai as-is (konfirmasi user) belum tervalidasi ke `GET /v1/models` → risiko 404 cascade. Mitigasi: timeout per-model + log `http_status` di `/admin/llm/logs`, toggle mudah via UI.
- Model `:free` OpenRouter rate-limit ketat → fallback berlapis sudah ada (`completion.ts:161-181`).
- Trade-off: non-DELETE menyimpan histori `llm_call_logs` + FK stage aman, tapi baris mati menumpuk — diterima (Non-Destructive Migrations).

## Progress Log
- 2026-09-05 11:00:00 — Plan dibuat (plan mode). Konfirmasi user: as-is, priority = urutan tulis, reasoning max untuk 7 Bynara + nano-reasoning.
- 2026-09-05 11:05:00 — Build mode aktif, eksekusi dimulai.
- 2026-09-05 12:55:00 — Migrasi `20260905000004_llm_models_resync.sql` dibuat + applied production (`llm_models_resync`). Verifikasi: 7 naraya aktif (10–70, reasoning max), 9 openrouter aktif (10–90, reasoning max hanya nano-reasoning), sisanya nonaktif. Stage defaults semua NULL (waterfall aman). Gate hijau: 263 tests ✓, typecheck ✓, lint ✓ (fix 1 baris pre-existing `let`→`const` di `discovery.ts:250` dari commit `cbb20ec`), build ✓.
- 2026-09-05 14:45:00 — Migrasi `20260905000005_llm_models_cloudflare.sql` dibuat + applied production (`llm_models_cloudflare`). Verifikasi: 10 cloudflare unik aktif (10–100, reasoning false semua), `llama-3.1-8b` nonaktif. Gate hijau: 263 tests ✓, typecheck ✓, lint ✓, build ✓ (50/50).

## Notes
- Bynara = slug DB `naraya` (`router.bynara.id`); UI tampilkan "Bynara (Naraya Router)".
- ID naraya tanpa prefix (per `20260829000007_fix_model_ids.sql`); OpenRouter pakai prefix `org/model`.
- Skala kecil → TOGAF tidak dipaksakan penuh (§3 AGENTS.md); cukup migrasi non-destruktif + DB-as-Code.
- Pola SQL ikut `20260903000002_llm_configurable_admin.sql` (`ON CONFLICT ... DO UPDATE`).
