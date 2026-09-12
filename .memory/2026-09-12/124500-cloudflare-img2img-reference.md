# Cloudflare img2img — image reference di Studio & Konten Review

- **Task:** Generate image dengan image reference (img2img) di Studio dan review, memakai model Cloudflare SD fase 1 (bertahap 2 model: `@cf/runwayml/stable-diffusion-v1-5-img2img` + `@cf/bytedance/stable-diffusion-xl-lightning`). Sumber referensi: upload file + pilih dari histori. Mask/inpainting ditunda fase 2 (keputusan user).
- **Docs dipelajari:** 4 halaman Cloudflare (stable-diffusion-v1-5-img2img, dreamshaper-8-lcm, stable-diffusion-xl-lightning, stable-diffusion-v1-5-inpainting). Parameter identik: `prompt`, `negative_prompt`, `image_b64`/`image[]`, `mask[]`, `strength 0–1` (default 1), `num_steps` (max 20), `guidance`, `seed`, `width/height` 256–2048. Output binding = `ReadableStream` → REST bisa JSON `{result:{image}}` atau biner.

## Key Files Changed

- `src/lib/image/types.ts` — `referenceImageB64`/`strength`/`numSteps`/`width`/`height` di `GenerateImageInput`; `SUPPORTED_IMG2IMG_MODELS`; helper `isImg2ImgModel`, `modelSupportsReference` (flag `config.supports_reference` > daftar model), `clampImg2Img*`, `stripDataUrlPrefix`, `bytesToBase64`, `assertValidReferenceFile`, `referenceExtensionFor`; kolom referensi di `DraftImageRow`.
- `src/lib/image/providers/cloudflare.ts` — branch Flux (perilaku lama) vs SD img2img (`image_b64`, strength, num_steps, guidance, dimensi aspek); parser respons JSON **dan** biner (`content-type: image/*` + fallback defensif); tolak referensi untuk model non-img2img sebelum request.
- `supabase/migrations/20260912000001_image_reference_img2img.sql` — 3 kolom aditif (`reference_storage_path`, `reference_public_url`, `reference_strength numeric CHECK 0–1`) di `user_image_generations` + `content_draft_images`; seed 2 model SD (is_default=false, `config.supports_reference=true`).
- `src/lib/studio/{types,validation,actions,storage,worker}.ts` — tipe + opsi model `supports_reference`; skema `referenceStrength`/`referencePublicUrl`; `uploadStudioReference` (bucket `user-images` prefix `ref/`); `fetchReferenceBytes`; worker fetch referensi → b64 sekali → adapter, audit `llm_meta.reference/reference_strength`; waterfall dipersempit ke model support saat referensi ada.
- `src/lib/image/{actions,config,storage,worker}.ts` — `ImageEnqueueOverride` + `uploadDraftImageReference` (bucket `draft-images` prefix `ref/`); `resolveImageTarget({ needsReference })` throw jujur untuk pin/sesi/default non-support + waterfall dipersempit; worker review teruskan referensi + audit; validasi URL referensi harus milik histori user/draf sendiri.
- `src/components/content/ReferencePicker.tsx` (baru) — picker bersama cover+reply: upload file, pilih dari histori, slider strength, peringatan model non-support, drag-drop.
- `src/components/studio/StudioForm.tsx` — panel referensi (upload + preview + slider + hapus), opsi model bertanda `· ref`, Auto+referensi dipersempit.
- `src/components/content/{DraftImageCard,PostImageControl,ImageHistoryCarousel}.tsx` — integrasi picker, badge `ref`, tombol "Jadikan referensi" dari slide histori.
- `src/components/studio/StudioHistory.tsx` — badge `ref` + tautan referensi di detail baris.
- `src/messages/{id,en}.json` — key `studio.form.reference*` + `studio.history.reference*`.
- `plans/2026-09-12-cloudflare-img2img-reference.md` — plan + progress log.

## Technical / Business Decisions

- Fase 1 img2img saja (tanpa mask editor); inpainting penuh fase 2.
- Rollout bertahap 2 model (bukan 4) — Dreamshaper + inpainting menyusul.
- Capability lewat `image_models.config.supports_reference` (configurable-by-table), fallback daftar model dikenal — tidak ada hardcode UI.
- Pin manual + referensi ke model non-support = gagal jujur; Auto + referensi = waterfall dipersempit ke model support (bukan silent-fallback tanpa referensi).
- Referensi harus dari upload sendiri atau histori user/draf yang sama (anti-tempel URL asing); file ≤5MB JPEG/PNG/WebP; storage reuse bucket existing prefix `ref/`.
- Default strength 0.6 (bukan 1 ala docs) dan num_steps 10 — kompromi kedekatan referensi + latensi cron.
- Model seed non-default agar waterfall existing tidak berubah sampai admin memilih.

## Assumptions / Risks

- R1: format respons REST SD belum diverifikasi live (docs hanya binding ReadableStream). Adapter toleran JSON + biner, tapi verifikasi nyata menunggu generate pertama di prod.
- R2: payload b64 referensi 5MB ≈ 6.7MB — masih dalam timeout 60s; resize server-side ditunda.
- R3: kuota generate tetap berlaku untuk img2img; upload referensi tidak memotong kuota.

## Verification

- `npm run typecheck` hijau; `npm run lint` hijau; `npm test` 507 tests hijau (62 file); `npm run build` hijau.
- Build menangkap pelanggaran `'use server'` (export const `STUDIO_REFERENCE_LIMITS`) yang lolos typecheck — dihapus sebelum commit.
- Test baru: adapter img2img (JSON + biner + clamp + tolak Flux), helper, validasi studio, worker studio (pin non-support), `resolveImageTarget needsReference`, carousel badge + Jadikan referensi, panel referensi Studio.

## Blockers / Unresolved

- Migrasi `20260912000001` belum di-apply ke prod (submodule sudah di-push; apply menyusul).
- Verifikasi live format respons SD + kualitas strength perlu dicoba setelah migrasi applied.

## Commit

- `feat(image): img2img Cloudflare image reference di studio dan review` — `6b4dcc4` (parent), `5e6c89d` (submodule supabase). Keduanya sudah di-push ke main.

## Related

- Plan: `plans/2026-09-12-cloudflare-img2img-reference.md`
- Migrasi: `supabase/migrations/20260912000001_image_reference_img2img.sql`
