# Image Generation Pasca-Development (5 Provider, Config-by-Table)

## Task
Setelah Development, tiap draft otomatis dapat 1 ilustrasi pendukung (LLM stage
`image_prompt` → provider image → Storage publik → review + lampiran Threads).
Provider prioritas: Pixazo 10 → Cloudflare 20 → Pollinations 30 → Gemini 40 →
Bynara 50. Multi-key backup per provider.

## Key files changed
- `supabase/migrations/20260907000003_image_generation.sql` — `image_providers`,
  `image_models` (flux-1-schnell / CF flux-schnell / flux / gemini-3.1-flash-lite-image /
  agnes-image-2.1-flash), `image_provider_keys` (multi-key), `image_style_presets` (5),
  `image_gen_defaults` (singleton), sessions override cols, `content_draft_images`
  (1 selected via partial unique), `drafts.selected_image_id`, `queue.image_url`,
  stage `image_prompt` (CHECK constraint diperluas), bucket `draft-images` + RLS.
- `supabase/migrations/20260907000004_image_worker_cron.sql` — pg_cron
  `asharu-image-worker */5` → `/api/image/generate`.
- `src/lib/image/{types,config,prompt,key-pool,storage,worker,actions}.ts` +
  `providers/{base,pixazo,cloudflare,pollinations,gemini,bynara,index}.ts` (+
  `providers.test.ts`, 14 tests).
- `src/lib/llm/types.ts` — `LLMStage` + `image_prompt` (tahap ke-7).
- `src/app/api/image/generate/route.ts` — cron worker (klaim 1 pending/tick,
  auto-enqueue draf tanpa image).
- `src/components/content/DraftImageCard.tsx` + `[draftId]/page.tsx` — preview,
  picker provider/model/style, generate/regenerate/select.
- Social ADITIF (sesi paralel tak bentrok): `threads.ts` (`createImageContainer`,
  `publishSinglePost`+fallback TEXT, `publishThreadChain(images?)`), route social
  (`image_url` + fallback cover, opener saja), `actions.ts` approve teruskan URL.
- `scripts/seed-image-keys.mjs` + `.env.example` (Vault, bukan .env).
- `plans/2026-09-06-image-generation-visualisasi.md` — plan + progress.

## Decisions
- Tabel `image_*` terpisah (bukan reuse `llm_*`) karena skema auth berbeda
  (Ocp-Apim-Key vs Bearer vs x-goog-api-key vs account_id).
- Gemini = `gemini-3.1-flash-lite-image` (2 Lite, bukan legacy 2.5); Bynara image =
  `agnes-image-2.1-flash` (agnes-2.5-flash di albot = reasoning teks).
- Key pool 2 lapis (key berikutnya → provider berikutnya), blame key hanya
  401/403/429; Pixazo URL di-fetch + re-upload ke Storage sendiri.
- Worker tidak block developing; social IMAGE gagal → fallback TEXT.

## Assumptions / risks
- API keys image BELUM di-seed → [USER ACTION]:
  `node --env-file=.env.local scripts/seed-image-keys.mjs` (5×: pixazo,
  cloudflare+account_id, pollinations, gemini, bynara). Tanpa key → worker gagal
  jujur (`failed` + last_error), auto-enqueue tetap jalan.
- Cloudflare `account_id` belum diisi (config `{}`) — diinput via seed script.
- Threads IMAGE butuh URL publik; bucket `draft-images` publik-read.
- Pollinations `flux` = model id default; bisa diganti via tabel tanpa kode.

## Verification
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 297 passed (38 files,
  +14 image, +3 threads-image; baseline 283) ✓.
- Migrasi applied production via MCP (schema + cron sukses, seed terverifikasi:
  5 provider, 5 model, 7 stage, styles).
- Secret scan diff: bersih.

## Commit
- Submodule `2e5c2f9 feat(image): image generation schema plus worker cron` (pushed).
- Parent `e2b61c9 feat(image): auto visualization after development with 5 providers` (pushed).

## Related
- `plans/2026-09-06-image-generation-visualisasi.md`
