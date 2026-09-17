# Ciora LLM Provider Plan

Created: 2026-09-17 22:56:00

## Objective

Tambahkan `ciora` (Universal AI Gateway `https://ciora.id/v1`, format OpenAI
`/chat/completions`, auth `Bearer`) sebagai provider LLM paling depan + 10 model,
semua `reasoning_effort=max` default.

## Scope

- In: union `ProviderSlug`, filter review, factory opsional + test, prompt seed
  script, komentar `.env.example`, 1 migrasi DB (provider + 10 model), seed 1 key,
  smoke test.
- Out: jalur Anthropic `/v1/messages` (user: OpenAI saja), perubahan
  waterfall/KeyPool/model-config, reorder provider lain.

## Milestones

1. Kode + migrasi siap.
2. Gate hijau + key terseed.
3. Smoke test 10 model + fallback terbukti.

## Tasks

- [x] `src/lib/llm/types.ts` — tambah `'ciora'` ke `ProviderSlug`.
- [x] `src/lib/admin/review-list.ts`, `src/components/admin/ReviewListClient.tsx` —
  tambah `'ciora'` ke daftar filter.
- [x] `src/lib/llm/providers/ciora.ts` (baru, konsistensi mengikuti `naraya.ts`):
  `createCioraProvider(baseUrl='https://ciora.id/v1')` + test kecil (URL
  `/chat/completions`, header Bearer, `reasoning_effort` diteruskan). Runtime tetap
  lewat `providerFromRow()` di `src/lib/llm/completion.ts` → `OpenAICompatibleProvider`.
- [x] `scripts/seed-llm-keys.mjs` — update prompt jadi
  `(naraya/openrouter/gemini/cloudflare/ciora)`; `.env.example` — tambah Ciora.
- [x] Migrasi di submodule `supabase/` (`20260917000001_llm_models_ciora.sql`),
  non-destruktif mengikuti pola `20260910000001_llm_models_gemini_bynara.sql`.
- [x] Commit submodule `supabase/` DULU, baru parent.
- [ ] [USER ACTION] Seed 1 key: `node --env-file=.env.local scripts/seed-llm-keys.mjs`
  → slug `ciora`, priority `0`.
- [x] Gate: `npm run typecheck`, `npm run lint`, `npm test` (+ `npm run build` bila
  sentuh pola build-only). Setiap edit setelah hijau = re-run gate.
- [ ] Smoke test per model via curl + cek `llm_call_logs`.
- [x] Memory: 1 entri `.memory/` + update `.memory/README.md`.

## Risks

- **Depan = blast radius besar:** ciora priority `5` (di depan naraya `10`) berarti
  semua trafik coba ciora dulu; bila gateway lambat/down, latensi naik sebelum
  fallback. Counter: provider lama tetap aktif sebagai fallback; `KeyPool` hanya
  blame key pada 401/403/429. Mitigasi: pantau `llm_call_logs` pasca-deploy; bila
  burn-in buruk, turunkan priority via admin drag (tanpa migrasi).
- **`max` untuk semua termasuk VL/vision/code:** bila gateway strict, bisa 400 atau
  output terpotong. Counter: `capEffortForStage` sudah cap ke `low` untuk stage
  output-pendek; knob per-model bisa diubah dari admin tanpa migrasi.
- **`model_id` exact:** salah satu karakter = semua call model itu gagal. Mitigasi:
  smoke test per model.

## Progress Log

- 2026-09-17 22:56:00 — rencana disusun dari jawaban user (max semua, depan, 1 key,
  OpenAI-only); eksekusi dimulai (build mode).
- 2026-09-17 10:49 — kode + migrasi selesai, gate hijau (typecheck/lint/710 tests),
  commit submodule `70b78e4` + parent `ec017d6`, pushed. Memory `0239a84`.
  Sisa user action: seed key, apply migrasi prod, smoke test 10 model.

## Notes

- Keputusan user: (1) reasoning default `max` semua; (2) provider langsung depan →
  `priority=5`, model priority 10..100 sesuai urutan list; (3) key sudah ada, 1 key
  semua model; (4) OpenAI saja.
- Bukan proyek telecom/utilitas dan bukan enterprise-scale — seremoni TOGAF ADM penuh
  tidak diterapkan; yang dipakai: pola DB-driven non-destruktif + RLS/Vault existing.
- `slug` DB = `text UNIQUE` tanpa CHECK (`20260828000000_content_factory.sql:90`),
  jadi `INSERT` aman; histori `llm_call_logs`/FK stage aman karena tanpa `DELETE`.
- 10 model: `nex-agi/nex-n2.5`, `inclusionai/ling-3.0-flash-vl`,
  `poolside/laguna-s-2.1-free`, `z-ai/glm-5.3-flash`, `qwen/qwen3.6-35b-a3b`,
  `step-3.7-flash`, `ciora-ai-free`, `cohere/north-mini-code-free`,
  `ciora-vision-free`, `ciora-coding-free`.
