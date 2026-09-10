# Resync Model Gemini + Bynara + Reasoning Configurable

Task: sesuaikan `llm_models` untuk Gemini (5 model) dan Bynara/naraya (6 model), disable sisanya, reasoning effort tertinggi, dan perluas Gemini agar reasoning configurable by table.

Key files changed:
- `supabase/migrations/20260910000001_llm_models_gemini_bynara.sql` (baru, submodule, applied prod) — upsert non-destruktif 5 gemini (10–50) + 6 naraya (10–60), disable di luar list.
- `src/lib/llm/model-config.ts` (baru) — `resolveModelParams` (4 level effort + thinking_budget/level + temperature + max_tokens) + `buildThinkingConfig` (level > budget > mapping effort; max/high→HIGH).
- `src/lib/llm/types.ts` — `ChatInput` tambah `thinkingBudget`/`thinkingLevel`.
- `src/lib/llm/completion.ts` — `chatInputFor` dipakai 3 jalur (waterfall/pinned/hint); config jadi fallback bila input null.
- `src/lib/llm/providers/gemini.ts` — kirim `generationConfig.thinkingConfig`; tanpa reasoning = tidak kirim.
- `src/lib/admin/llm-actions.ts` — `updateModelConfig` generik (merge jsonb + validasi range); `updateModelReasoning` lama dipertahankan.
- `src/components/admin/llm/ModelBoard.tsx` — form per-model: select effort + input budget/level/temperature/max_tokens.
- `src/components/content/StageModelPicker.tsx` (+`modelEffortLabel`) & `AffiliateProductCard.tsx` — badge tampilkan level effort.
- `src/lib/llm/model-config.test.ts` (10) + `src/lib/llm/providers/gemini.test.ts` (3) — baru.
- `plans/2026-09-10-llm-model-resync-gemini-bynara.md` (baru).

Decisions:
- Priority = urutan tulis list user (pola 2026-09-05).
- ID dipakai as-is tanpa validasi `GET /v1/models`.
- Satu key `thinkingConfig` saja (level > budget > mapping) agar kompatibel 2.5 & 3.x; tanpa effort = hemat (penting untuk lite).

Assumptions/risks:
- Bentuk `thinkingLevel` Gemini 3.x belum tervalidasi live (docs fetch gagal) — verifikasi 1 call per model pasca-deploy; waterfall jadi jaring pengaman.
- Admin bisa salah set knob → mitigasi validasi range + placeholder contoh.

Verification:
- SELECT prod: 5 gemini aktif + 6 naraya aktif sesuai urutan; stage defaults NULL.
- Gate hijau: `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 346 passed (46 files) ✓.

Commit proposal: `feat(llm): resync gemini 5 plus bynara 6, reasoning configurable by table`
