# 5 Model Image Cloudflare Baru → Studio + Visualisasi Draft

Created: 2026-09-17 21:37:51

## Objective

Tambahkan 5 model Text-to-Image Cloudflare Workers AI (`flux-2-klein-4b`, `flux-2-dev`, `phoenix-1.0`, `lucid-origin`, `flux-2-klein-9b`) ke menu Studio dan visualisasi draft konten (cover + per-reply manual), tanpa mengubah default existing dan tanpa SDK/env baru.

Keputusan user (17 Sep 2026):
1. Default tetap `flux-1-schnell` (model baru `is_default=false` semua).
2. Phoenix/Lucid **hanya manual** (tombol Generate review/Studio; tanpa auto cover).
3. Parameter advanced (`guidance`, `num_steps`, `seed`, dimensi) **diekspos** di StudioForm + review picker.
4. Flux-2 **langsung single-reference** (tidak text-only dulu; multi-ref ditunda).
5. **Clamp auto** maks 1024px / 25 steps; HD hanya via pin manual.

## Scope

- Migrasi DB aditif: 5 baris `image_models` + 5 kolom advanced (`guidance`, `steps`, `seed`, `req_width`, `req_height`) di `user_image_generations` + `content_draft_images`.
- Adapter `CloudflareImageAdapter`: cabang Leonardo (Phoenix biner + Lucid JSON tanpa negative) + Flux-2 (JSON/FormData toleran, single-ref).
- Plumbing Studio (enqueue/worker/form/history) + Draft (override/actions/worker/carousel/picker) untuk advanced + clamp + audit `llm_meta`.
- Style `no text` dikecualikan untuk model text-capable (Phoenix/Lucid).
- Test + gate + commit submodule-dulu.

Out of scope: multi-reference Flux-2 (tetap single-ref), mask/inpainting, perubahan default/waterfall prioritas, rotasi key baru.

## Milestones

1. Fase 0 — Spike parameter (docs + OpenAPI + probe aman).
2. Fase 1 — Migrasi DB aditif (submodule dulu).
3. Fase 2 — Adapter + types.
4. Fase 3 — Plumbing Studio + Draft + UI advanced + cost guard.
5. Fase 4 — Test + gate + commit/push.

## Tasks

- [x] Fase 0: tabel request/response aktual 5 model (JSON vs FormData, wrapper Lucid, biner Phoenix)
- [x] Fase 1: `supabase/migrations/20260919000001_cloudflare_flux2_leonardo_models.sql` (5 model + 5 kolom × 2 tabel), verifikasi lokal
- [x] Fase 2: `types.ts` detector+clamp, `cloudflare.ts` cabang Leonardo + Flux-2, pesan reference generik
- [x] Fase 3a: Studio — validation/input/worker clamp+advanced, `StudioForm` `<details> Advanced`, history/i18n
- [x] Fase 3b: Draft — override/actions/worker, `DraftImageCard`/`PostImageControl`/`StageModelPicker` advanced, manual-only Phoenix/Lucid, pengecualian `no text`
- [x] Fase 4: unit test adapter/worker/UI + `npm run typecheck` + `npm run lint` + `npm test` + `npm run build` + commit/push submodule+parent

## Risks

- Skema Flux-2 opaque (`multipart{}`) → mitigasi spike; Fase 1 independen tetap jalan.
- Biaya Leonardo per tile+step → mitigasi manual-only + clamp + `daily_limit:20` + `failure_count>5` nonaktif.
- Satu `account_id`/key-pool untuk 8 model Cloudflare → blast-radius 429; mitigasi prioritas + failure per-model.
- Timeout 60s untuk HD/dev; i18n key hilang (bug label mentah sebelumnya) → allow-list `client-messages.ts`.
- Lisensi partner (BFL/Leonardo terms) perlu review komersial sebelum produksi.
- `DO UPDATE config = config || EXCLUDED.config` bisa timpa flag manual → hanya merge key dikenal.

## Progress Log

- 2026-09-17 21:37:51 — Plan dibuat dari analisa docs + keputusan user 5 poin. Mode build aktif, mulai Fase 0.
- 2026-09-17 ~21:55 — Fase 0 SELESAI (docs-only, tanpa live probe — key hanya di Vault, tak ada akses CF dari env ini):
  - Flux-1 Schnell (pembanding): JSON `{prompt*, steps max 8}` + `seed` (contoh curl), output `{image: b64}`.
  - Phoenix-1.0: JSON `{prompt*, guidance 2–10/def 2, seed, w/h def 1024/0–2048, num_steps 1–50/def 25, negative_prompt}` → output **biner `image/jpeg`** (binding `ReadableStream`).
  - Lucid-origin: JSON `{prompt*, guidance 0–10/def 4.5, seed, w/h def 1120/0–2500, num_steps/steps 1–40}`, **tanpa `negative_prompt`** → output JSON `{image: b64}`.
  - Flux-2 (klein-4b/9b, dev): input **opaque `multipart{}`** (field tak terekspos); OpenAPI TextToImage generik kenal `prompt/guidance/height/image[]/image_b64/mask/negative_prompt/num_steps(max 20)/seed/strength/width(256–2048)`.
  - Keputusan desain: Flux-2 = **FormData primary** (`prompt` + field advanced user + part file `image` bila ref; tanpa set Content-Type manual) dengan **fallback JSON minimal 1x khusus HTTP 400**; override eksplisit via `parameters.transport` (`multipart|json|auto`). Alasan: docs tulis multipart required, tapi JSON generik kemungkinan diterima; fallback 400-only tidak boros (validasi gagal = tak ada gambar = tak tertagih) dan tak menutupi 401/403/429/5xx (tetap ke key-pool).
  - [USER ACTION] Live probe bila 400 ganda: user kirim contoh curl dengan dev key, atau izinkan admin flip `config.transport` (perlu Fase 3b forward config → parameters).
- 2026-09-17 ~22:15 — Fase 1–3 SELESAI (kode). Migrasi `20260919000001` (5 model priority 23–27 + 5 kolom advanced × 2 tabel, semua is_default=false). Adapter: Leonardo (Phoenix native+biner, Lucid fold+dual steps) + Flux-2 (FormData primary, fallback JSON 400-only, override transport). Worker Studio+draft: `resolveEffectiveAdvanced` (Auto clamp ≤1024/≤25, pin sampai maks model) + `stripNoTextClause` untuk text-capable + audit `advanced/advanced_clamped`. UI: `<details> Advanced` Studio + cover + per-reply, label `· teks`, baris Advanced di history/carousel, i18n id/en. Gate: typecheck ✓ lint ✓ 816 tests ✓ build ✓.
- 2026-09-17 ~22:25 — Fase 4 SELESAI. Test baru: adapter Leonardo/Flux-2 + helper clamp/detektor + validasi advanced + UI Studio/carousel (27 test baru, total 816 ✓). Gate hijau penuh. Commit submodule `31cc70a` + parent `6b7e4c3`, pushed. [USER ACTION] Apply migrasi prod + uji live 5 model.

## Notes

- Endpoint sama: `POST {base}/accounts/{account_id}/ai/run/{model}` + Bearer (adapter existing `src/lib/image/providers/cloudflare.ts:59-65`).
- Phoenix output biner `image/jpeg` (sudah ditangani `parseResult`); Lucid JSON `{image: b64}` tanpa `negative_prompt` (lipat `Avoid:`).
- TOGAF proporsional: fitur kecil satu provider, cukup catat di sini. C2M/TM Forum tidak relevan (bukan billing telko).
- Contoh seed ilustratif:

```sql
INSERT INTO public.image_models (provider_id, model_id, display_name, is_default, priority, config)
SELECT p.id, '@cf/leonardo/phoenix-1.0', 'Phoenix 1.0 (Teks Akurat)', false, 26,
  '{"supports_reference": false, "guidance_default": 2, "steps_default": 20, "max_steps": 50, "max_dim": 2048, "negative_mode": "native", "output": "binary"}'::jsonb
FROM public.image_providers p WHERE p.slug='cloudflare'
ON CONFLICT (provider_id, model_id) DO UPDATE SET display_name=EXCLUDED.display_name, is_active=true,
  config = public.image_models.config || EXCLUDED.config;
```
