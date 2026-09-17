# 5 Model Image Cloudflare (FLUX.2 + Leonardo) → Studio + Draft

Task: tambah `@cf/black-forest-labs/flux-2-klein-4b`, `flux-2-klein-9b`, `flux-2-dev`, `@cf/leonardo/phoenix-1.0`, `@cf/leonardo/lucid-origin` ke Studio + visualisasi draft (cover + per-reply manual). Keputusan user: default tetap flux-1-schnell, Phoenix/Lucid manual-only, advanced diekspos, Flux-2 langsung single-ref, clamp auto 1024px/25 steps.

Key files:
- `supabase/migrations/20260919000001_cloudflare_flux2_leonardo_models.sql` — 5 model (priority 23–27, is_default=false) + kolom `guidance/steps/seed/req_width/req_height` × 2 tabel.
- `src/lib/image/types.ts` — detektor `isFlux2/Leonardo/Phoenix/LucidModel`, `modelRendersText`, `stripNoTextClause`, `clampGuidance/TextSteps/RequestDimension/AutoParams`, `modelDefaultParams`, `modelNegativeMode`, `resolveEffectiveAdvanced`.
- `src/lib/image/providers/cloudflare.ts` — cabang Leonardo (Phoenix native+biner, Lucid fold+dual steps) + Flux-2 (FormData primary, fallback JSON khusus 400, override `transport`); parser 3 bentuk.
- `src/lib/image/providers/index.ts` — factory teruskan `modelConfig` baris model (bukan config provider).
- `src/lib/studio/{worker,actions,validation,types}.ts` + `src/lib/image/{worker,actions}.ts` — plumbing advanced + clamp + audit `advanced/advanced_clamped` + pengecualian `no text` + pesan reference generik.
- UI: `StudioForm`, `DraftImageCard`, `PostImageControl` (`<details> Advanced`), `StudioHistory`, `ImageHistoryCarousel`, `ReferencePicker` (flag `text_capable`, label `· teks`), `src/messages/{id,en}.json` (12 key advanced + 2 copy selaras).
- Tests: `providers.test.ts` (+22: Leonardo/Flux-2/helper), `validation.test.ts` (+1), `StudioUi.test.ts` (+3), `ImageHistoryCarousel.test.tsx` (+1).

Decisions:
- Flux-2 FormData primary + fallback JSON 400-only (hemat; 401/403/429/5xx tetap ke key-pool). Override `transport` via parameters/config.
- Auto clamp hemat; pin manual sampai maks model. Single-ref dulu (multi-ref ditunda).
- Phoenix/Lucid manual-only ditegakkan via label + tanpa auto-enqueue (tanpa guard DB baru).
- `json.dumps` untuk i18n DILARANG (merusak indentasi inline) — pakai edit teks presisi.

Assumptions/risks:
- Skema Flux-2 opaque (docs `multipart{}`); bila live 400 ganda, butuh contoh curl user / flip `config.transport`.
- Biaya Leonardo per tile+step; lisensi partner (BFL/Leonardo) perlu review komersial.
- Satu account_id/key-pool untuk 8 model Cloudflare (blast-radius 429).

Blockers/unresolved:
- [USER ACTION] Apply migrasi prod `20260919000001` via MCP/supabase → verifikasi 5 model aktif → uji live: Phoenix teks, Lucid HD pin, Flux-2 text + single-ref (multipart vs fallback tercatat di `llm_meta.transport`).

Verification: `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 816/816 ✓, `npm run build` ✓.

Commit proposal: `feat(image): tambah 5 model cloudflare flux-2 dan leonardo ke studio dan draft`
