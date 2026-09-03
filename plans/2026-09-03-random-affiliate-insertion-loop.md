# Random Affiliate Insertion — Fallback 20 Produk Terbaru + Loop Reselect → Rethink

Created: 2026-09-03 22:30

## Objective
Riset `2aa5be7d-ea55-47dd-afbf-7e683ae076b2` sudah bagus (5 topik score 7.7–8.3 kategori inspirasi/tips) tapi semua `Tanpa produk` / `Produk tidak cocok` karena `MIN_ACCEPTABLE_SCORE=6` tidak tercapai di pool 50 produk terbaru (kategori electronics vs pool automotive/fashion-heavy). Tujuan: setiap draft tetap punya 1 link afiliasi — fallback **random dari 20 produk terbaru** dengan kalimat jembatan natural via LLM; jika admin menilai tidak natural, admin reselect produk → LLM **rethink hanya 1 reply sisipan** dalam loop sampai cocok.

Pilihan user: **1. Random fallback** (scoring dulu, fallback hanya jika null) + **2. Rewrite 1 reply** (hemat token, preservasi konteks).

## Scope
- In: `src/lib/research/affiliate.ts` (pool 20 + random + fallback), `src/lib/llm/prompt.ts` (bridging + single-reply rewrite), `src/lib/research/development.ts` (pakai fallback), `src/lib/content/actions.ts` (action `regenerateAffiliateInsertion`), `src/components/content/AffiliateProductCard.tsx` + `AffiliateProductPicker.tsx` (loop UI).
- Out: discovery/verification/scoring, scraper, kategori baru.

## Milestones
1. Fallback random di affiliate
2. Bridging prompt & single-reply rewrite prompt
3. Development pakai fallback
4. Action regenerate + UI loop
5. Verifikasi

## Tasks
- [x] T1 affiliate.ts: `RANDOM_FALLBACK_POOL_SIZE=20`, `fetchRandomPool()`, `selectAffiliateWithRandomFallback()`, signal `fallback_random` + `original_best_score`
- [x] T2 prompt.ts: param `isFallbackRandom` di `buildThreadPrompt` (bridging rule), fungsi `buildSingleReplyRewritePrompt` untuk rewrite 1 reply
- [x] T3 development.ts: pakai `selectAffiliateWithRandomFallback`, teruskan `isFallbackRandom` ke prompt
- [x] T4 actions.ts: `regenerateAffiliateInsertion(draftId, newProductId)` — LLM rethink 1 reply, rate-limit, history, `replacePlaceholders`
- [x] T5 AffiliateProductCard: picker 20 terbaru → panggil `regenerateAffiliateInsertion` (loop), badge fallback, busy/error
- [x] T6 Test/build: `npm run test` 240 passed, `tsc --noEmit` OK, `next lint` OK

## Risks
- Spammy jika bridging gagal → mitigasi: instruksi bridging wajib 1-2 kalimat konteks + disclaimer, single-reply rewrite preservasi topik, band `low` tetap ditampilkan.
- Biaya LLM per reselect → mitigasi: single reply maxTokens 400, rate-limit 20/jam, cron guard tetap.
- Swap lama tidak update `generated_thread` URL → mitigasi: action baru selalu regen & `replacePlaceholders`.

## Progress Log
- 2026-09-03 22:15 — Riset 2aa5be7d diinspeksi, plan didraft (plan mode).
- 2026-09-03 22:30 — Build mode, mulai implement 1A.
- 2026-09-03 02:43 — `affiliate.ts` fallback random 20 + `prompt.ts` bridging + `buildSingleReplyRewritePrompt` + `development.ts` fallback + `actions.ts` `regenerateAffiliateInsertion` + `AffiliateProductCard` loop UI (Reselect & Rethink vs swap cepat). Fix shadow `count` → `placeholderCount`. `npm test` 240/240 passed (was 234, +6 new thread tests counted), `tsc --noEmit` OK, `next lint` OK.

## Notes
- TOGAF proporsional (non-telecom): Business→Data→Application→Technology ringan.
- `previewAffiliateMatches` tetap strict (warn), tidak diblok; fallback hanya di `developing`.
- Pool random: `ORDER created_at DESC LIMIT 20` deterministis, pick `Math.random()` server-side.
