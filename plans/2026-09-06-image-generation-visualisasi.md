# Visualisasi Otomatis Pasca-Development (Image Generation Configurable-by-Table)

Created: 2026-09-06 12:00:00

## Objective

Setelah `developing → completed`, tiap `content_drafts` otomatis dapat 1 ilustrasi pendukung (contoh `ba9b8a04`: wajan lengket dari post utama). LLM stage khusus `image_prompt` memikirkan visualisasi dari post utama, lalu provider image meng-generate. Hasil tampil di `/konten/review` (preview + regenerate), dan jadi lampiran saat auto-post Threads (sesi paralel) sudah aktif.

Keputusan user: trigger = auto + regenerate manual; prompt = stage LLM khusus; storage = Supabase Storage publik; config = global + per-session + per-draft; 5 provider prioritas Pixazo 10 → Cloudflare 20 → Pollinations 30 → Gemini 40 → Bynara 50; Gemini model = `gemini-3.1-flash-lite-image`; Bynara model = `agnes-image-2.1-flash`; tiap provider dukung N key backup (saat ini 1 key).

## Scope

- Skema `image_*` di submodule `asharu-supabase`: providers, models, provider_keys (multi-key), style_presets, gen_defaults + override sesi + draft_images + `queue.image_url` + bucket `draft-images` + baris stage `image_prompt`.
- Adapter image 5 provider (port Pixazo/Bynara/Pollinations dari albot; baru Cloudflare-flux + Gemini-nano-banana).
- Key pool 2 lapis (key berikutnya → provider berikutnya), blame key hanya 401/403/429.
- Worker cron `/api/image/generate` + upload Storage + server actions + review UI + social IMAGE attach (aditif).
- Seed script `seed-image-keys.mjs` + `.env.example`.

## Milestones

1. Fase 0 — Riset provider (SELESAI 6 Sep: adapter albot + docs CF/Gemini/Pollinations dipetakan).
2. Fase 1 — Skema + lib + worker + Storage + seed script.
3. Fase 2 — Review UI + per-draft override + regenerate.
4. Fase 3 — Social attach + hardening + gate + push.

## Tasks

- [x] Riset albot + docs (pixazo/bynara/pollinations adapter, CF flux schnell, Gemini nano banana, Pollinations OpenAI-compat)
- [x] Migrasi `20260907000003_image_generation.sql` + `20260907000004_image_worker_cron.sql` (applied production)
- [x] `src/lib/image/*` (types, config, styles, key-pool, 5 adapters, worker, storage, prompt) + tests (14 baru)
- [x] LLM stage `image_prompt` (types + stage_defaults + prompt builder)
- [x] Route `/api/image/generate` (cron worker) + server actions + `seed-image-keys.mjs`
- [x] Review UI `<DraftImageCard>` + integrasi `[draftId]` page
- [x] Social IMAGE attach aditif (`createImageContainer`, `queue.image_url`, approve teruskan URL) + 3 test baru
- [ ] Gate hijau + commit submodule dulu + push

## Risks

- Seed Gemini pakai model legacy 2.5 → DIPUTUSKAN pakai `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite).
- Bynara `agnes-2.5-flash` ternyata model reasoning teks → DIPUTUSKAN pakai `agnes-image-2.1-flash`.
- Pixazo return URL (bukan bytes) → worker fetch + re-upload ke Storage sendiri.
- Worker image lambat (120s) → jalan di cron `maxDuration:300`, bukan server action; tidak block `developing → completed`.
- Bentrok sesi paralel social → sentuhan ke `src/lib/social/*` hanya aditif (`createImageContainer`, kolom `image_url`); tidak ubah logika TEXT/queue yang ada.
- Jangan simpan key di kolom (kecuali hash/suffix audit) → Vault by-name; secret tak pernah di-echo.

## Progress Log

- 2026-09-06 12:00:00 — Plan dibuat (keputusan trigger/stage/storage/granularitas via tanya-jawab).
- 2026-09-06 12:15:00 — Revisi: referensi albot + docs CF/Gemini/Pollinations; tambah Pollinations setelah Cloudflare; kunci model Bynara 2.1 + urutan fallback.
- 2026-09-06 12:20:00 — Koreksi user: Gemini → `gemini-3.1-flash-lite-image`; multi-key backup per provider.
- 2026-09-06 12:25:00 — Masuk Build Mode; mulai Fase 1 (working tree bersih, sesi social idle + committed).
- 2026-09-06 — Tambahan user: style `ugc-pov` (UGC, cahaya seadanya, kamera mediocre, POV pertama) via `20260907000005`, applied production; picker + worker otomatis ikut tanpa ubah kode.

## Notes

### Referensi provider (hasil riset)

- Pixazo flux: `POST https://gateway.pixazo.ai/flux-1-schnell/v1/getData`, header `Ocp-Apim-Subscription-Key`, body `{prompt, negative_prompt?, width, height, num_steps=4, seed?}` → `{output: httpsURL}`. Port `albot/src/server/providers/image/pixazo.adapter.ts`.
- Cloudflare flux: `POST .../accounts/{account_id}/ai/run/@cf/black-forest-labs/flux-1-schnell`, Bearer CF token, `{prompt ≤2048, steps=4 maks 8}` → `{result:{image: base64}}`. `account_id` dari config provider.
- Pollinations flux: `POST https://gen.pollinations.ai/v1/images/generations`, Bearer, `{prompt, model:"flux", n:1, size, response_format:"b64_json"}` → `{data:[{b64_json}]}`. Port adapter albot (minta `b64_json`).
- Gemini: `POST {base}/models/gemini-3.1-flash-lite-image:generateContent`, header `x-goog-api-key` (tiru `providers/gemini.ts`), `{contents, generationConfig:{responseModalities:["TEXT","IMAGE"]}}` → `inlineData{data,mimeType}`. Watermark SynthID.
- Bynara: `POST https://api-images.bynara.id/v1/images/generations`, Bearer + Referer/Title, `{prompt(+" Avoid: "+neg), model:"agnes-image-2.1-flash", n:1, size, response_format:"b64_json"}` → `{data:[{b64_json}]}`. Port adapter albot.

### Standar

Bukan sistem billing/telekomunikasi → tak pakai C2M/TM Forum; arsitektur ringan konsisten repo (config-by-table, RLS admin, Vault, cron worker, key pool round-robin + circuit breaker).
