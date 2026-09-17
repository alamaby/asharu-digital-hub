# Provider LLM Ciora Gateway + 10 model

Tanggal: 2026-09-17 10:49 (local time)

## Task / Masalah

Tambahkan provider LLM baru `ciora` (Universal AI Gateway `https://ciora.id/v1`,
format OpenAI `/chat/completions`, auth `Bearer`) dengan 10 model, semua
`reasoning_effort=max` default, provider langsung paling depan.

## File kunci yang diubah

- `src/lib/llm/types.ts` — `'ciora'` ke union `ProviderSlug`.
- `src/lib/admin/review-list.ts`, `src/components/admin/ReviewListClient.tsx` —
  `'ciora'` ke filter review.
- `src/lib/llm/providers/ciora.ts` (baru) + `ciora.test.ts` (baru, 3 tests) —
  factory `createCioraProvider()` mengikuti pola `naraya.ts`. Runtime tetap lewat
  `providerFromRow()` → `OpenAICompatibleProvider` (tanpa kelas transport baru).
- `scripts/seed-llm-keys.mjs` — prompt slug + `ciora`; `.env.example` — komentar key.
- `supabase/migrations/20260917000001_llm_models_ciora.sql` (baru) — provider
  `ciora` priority 5 + 10 model priority 10..100, non-destruktif (tanpa DELETE).
- `plans/2026-09-17-ciora-llm-provider-plan.md` — plan file.

## Keputusan teknis / bisnis

- Format OpenAI-only (keputusan user); tanpa kelas Anthropic `/v1/messages`.
- Priority provider `5` = depan naraya (10). Risiko latensi bila gateway down;
  mitigasi: provider lama tetap fallback + reorder via admin tanpa migrasi.
- Reasoning `max` untuk semua 10 (keputusan user); `capEffortForStage` tetap cap ke
  `low` untuk stage output-pendek; knob per-model bisa diubah dari admin.
- `slug` DB tanpa CHECK → `INSERT` aman; histori `llm_call_logs`/FK stage aman.

## Asumsi / risiko

- `model_id` exact dari user diasumsikan benar — perlu smoke test 10/10 (belum).
- Key diasumsikan sudah ada (1 key semua model) — seed ke Vault belum dilakukan.

## Blocker / belum selesai (URUTAN PENTING — koreksi 10:57 atas feedback user)

1. [USER ACTION] Apply migrasi ke prod DULU (Supabase Dashboard / CLI).
2. [USER ACTION] Seed key: `node --env-file=.env.local scripts/seed-llm-keys.mjs`
   → slug `ciora`, priority `0`.
3. [USER ACTION] Smoke test 1 call per model + cek `llm_call_logs`.

Alasan urutan: `seed-llm-keys.mjs:49-53` query `llm_providers` by slug dan exit(2)
"Provider ciora not found" bila migrasi belum di-apply. Plan file sudah dibetulkan.

- Pantau `llm_call_logs` pasca-deploy; bila burn-in buruk turunkan priority ciora.

## Verifikasi

- `npm run typecheck` hijau, `npm run lint` hijau, `npm test` 710/710 hijau
  (termasuk 3 test ciora baru). Re-run typecheck+lint setelah edit plan file
  (aturan repo: edit apa pun membatalkan gate).
- Commit: submodule `70b78e4` (push dulu), parent `ec017d6` (push). Diff di-scan,
  tanpa secret.

## Commit yang diusulkan

Sudah di-commit + push: `feat(llm): tambah provider ciora gateway + 10 model reasoning max`
(parent `ec017d6`, submodule `70b78e4`).

## Rencana / isu terkait

- `plans/2026-09-17-ciora-llm-provider-plan.md` (sebagian tasks masih `[ ]`:
  seed key, smoke test — ranah user action).
