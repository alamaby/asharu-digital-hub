# Cloudflare img2img Image Reference (Studio & Konten Review)

Created: 2026-09-12 07:30:00

## Objective

User bisa generate image memakai image reference (upload file atau pilih dari histori) di Studio (`user_image_generations`) dan Konten Review (`content_draft_images`), memakai model Cloudflare img2img fase 1, dengan kontrol strength, audit jujur (pin/waterfall + referensi), dan gate hijau.

## Scope

- In: kontrak `GenerateImageInput` + `CloudflareImageAdapter` img2img; migrasi aditif kolom referensi + seed 2 model; Studio end-to-end; Review end-to-end; i18n id/en; test + gate.
- Out (fase 2): mask editor / inpainting penuh, Dreamshaper + inpainting activation, resize server-side canggih, reuse referensi antar-user.

## Milestones

1. M1 — Kontrak + adapter (tipe, capability, mock test JSON+biner).
2. M2 — DB + storage referensi (migrasi + RLS reuse bucket).
3. M3 — Studio end-to-end (form → action → worker → histori).
4. M4 — Review end-to-end (cover + per-reply opt-in).
5. M5 — Seed 2 model + i18n + gate hijau.

## Tasks

- [x] Pelajari 4 docs Cloudflare (parameter identik; `image_b64`, `strength 0-1`, `num_steps max 20`, output `ReadableStream`).
- [x] M1: `GenerateImageInput` + helper reference + adapter Cloudflare img2img + test (33 tests providers hijau).
- [x] M2: migrasi kolom referensi + seed 2 model SD (`20260912000001_image_reference_img2img.sql`).
- [x] M3: Studio end-to-end (types, validation, actions+upload, worker, StudioForm, options config).
- [x] M4: Review end-to-end (actions+upload, worker, DraftImageCard, PostImageControl, ReferencePicker, carousel badge + "Jadikan referensi").
- [x] M5: i18n id/en + test + gate typecheck/lint/test/build (507 tests + build hijau).
- [ ] Commit submodule + parent, push.
- [ ] Apply migrasi ke prod (user action / via MCP setelah review).

## Risks

- R1 — Format respons SD via REST belum pasti (docs hanya `ReadableStream`). Mitigasi: spike + adapter toleran JSON maupun biner. **Status: adapter toleran sudah diimplementasi; verifikasi live masih pending saat generate pertama di prod.**
- R2 — Payload b64 besar (~6.7MB untuk 5MB). Mitigasi: batas 5MB, timeout 60s, clamp dimensi.
- R3 — Auto/waterfall + referensi ke model non-support. Mitigasi: pin non-support ditolak jelas; Auto dipersempit ke model support bila referensi ada (dengan audit jujur). **Terimplementasi di Studio worker, review worker, dan `resolveImageTarget`.**
- R4 — Penyalahgunaan referensi. Mitigasi: owner-only (RLS/histori sendiri), kuota tetap, audit URL tersimpan. **URL referensi divalidasi harus milik histori user/draf yang sama.**
- R5 — Strength disangka mask. Mitigasi: copy UI tegas tanpa mask; inpainting fase 2.

## Progress Log

- 2026-09-12 07:30 — Plan disimpan; mulai M1.
- 2026-09-12 — Keputusan user: fase 1 img2img saja; sumber upload+histori; rollout bertahap 1-2 model (`stable-diffusion-v1-5-img2img` + `stable-diffusion-xl-lightning`).
- 2026-09-12 — M1–M5 selesai: adapter Cloudflare img2img (JSON + biner + clamp), migrasi DB, Studio + review end-to-end, ReferencePicker bersama, badge ref, "Jadikan referensi" dari histori, i18n id/en. Gate: typecheck + lint + 507 tests + build hijau. Catatan: build sempat menangkap `export const` di file `'use server'` (STUDIO_REFERENCE_LIMITS) yang lolos typecheck — dihapus.
- 2026-09-12 — Menunggu: commit/push + apply migrasi prod + verifikasi live format respons REST model SD.

## Notes

- File kunci: `src/lib/image/providers/cloudflare.ts`, `src/lib/image/types.ts`, `src/lib/image/providers/{base,index}.ts`, `src/lib/studio/{types,actions,validation,worker,storage}.ts`, `src/lib/image/{actions,worker,storage}.ts`, `src/components/studio/StudioForm.tsx`, `src/components/content/DraftImageCard.tsx`, `src/components/content/PostImageControl.tsx`, migrasi `supabase/migrations/20260911*.sql`, `20260907*image_generation.sql`.
- Konvensi: configurable-by-table (`config.supports_reference`), pin gagal jujur tanpa fallback lintas-provider, audit `pinned/requested_*` + `reference`, gate hijau sebelum commit, submodule `supabase/` commit dulu.
- TOGAF proporsional untuk fitur kecil; bukan domain rating/billing telekomunikasi sehingga Oracle C2M / TM Forum ODA tidak relevan.
