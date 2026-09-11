# Camera Angle Templates (configurable by table)

Tanggal: 2026-09-11 21:32 (local)

## Tugas
Template camera angle dikelola admin di `/admin/visual`, tampil sebagai picker di Studio + konten review (cover & per-reply), worker auto-append natural ke prompt. Keputusan user: (1) kolom minimal; (2) tambah `camera_slug` ke `content_draft_images` (+ studio); (3) auto-append natural di worker.

## File kunci
- `supabase/migrations/20260911000003_image_camera_angles.sql` (submodule) — tabel `image_camera_angles` + seed 25 + RLS + 3 kolom FK (`image_studio_config.default_camera_slug`, `user_image_generations.camera_slug`, `content_draft_images.camera_slug`)
- `src/lib/image/camera-angles.ts` + `camera-angles.test.ts` (7 test) — `appendCameraAngle(prompt, angle, maxLen?)` + anti-duplikat contains
- `src/lib/admin/visual-actions.ts` — add/update/toggle/reorder camera angles
- `src/components/admin/visual/CameraAngle{Board,Forms}.tsx`, `admin/visual/page.tsx` (section), `admin/visual/angles/[angleSlug]/page.tsx`, `src/i18n/routing.ts`
- Studio: `lib/studio/{types,actions,validation,worker}.ts`, `StudioForm.tsx` (dropdown + default config), `messages/{id,en}.json` (`cameraLabel/cameraAuto`)
- Review: `konten/review/[draftId]/page.tsx` (query + pass cameras), `DraftImageCard.tsx` + `PostImageControl.tsx` (picker + rehydrate + kirim override), `lib/image/{actions.ts (override/suggest), worker.ts (append), types.ts (camera_slug)}`
- Test mock: `StudioUi.test.tsx` (cameras + camera_slug), `ImageHistoryCarousel.test.tsx` (camera_slug)

## Keputusan / asumsi
- Komposisi studio: `[subject, prompt, angle, style_suffix]`; review: `[prompt, angle, style_suffix]`. Angle sebelum style suffix (framing = scene, style = instruksi render).
- `appendCameraAngle` tanpa maxLen = join murni (worker tidak memotong prompt user; batas 500 hanya textarea UX). Dengan maxLen=500 (suggest) → potong prompt, jaga angle.
- Anti-duplikat via `contains` case-insensitive (suggest sudah sisipkan angle ke textarea; worker tidak gandakan + guard kolom).
- Asimetri subjek (tanpa kolom, helper suggest saja) vs angle (ada kolom, auditable) = disengaja per keputusan user.
- Seed 5 pertama diterjemahkan faithful ID→EN; apostrof `Bird's-eye` diluruskan; `birds-eye-seated-lifestyle`.
- `ContentDraftCard` default `imageOptions` tanpa cameras → `PostImageControl`/`DraftImageCard` pakai `(options.cameras ?? [])`, aman backward-compat.

## Risiko / catatan
- ~~Migrasi BELUM di-apply ke prod~~ → **APPLIED 2026-09-11 21:45** via MCP `apply_migration` (nama `image_camera_angles`, success). Verifikasi prod: seed 25/25 aktif (sort 10–250, angle_en 27–56 char); kolom `camera_slug` nullable di `content_draft_images` + `user_image_generations`, `default_camera_slug` nullable di `image_studio_config`; 3 FK `ON DELETE SET NULL`; RLS `image_angles_admin` (ALL, is_admin) + `image_angles_user_read` (SELECT aktif); spot-check 6 seed pertama OK.
- Advisors pasca-apply: security = pre-existing (is_admin search_path, SECURITY DEFINER fns, leaked-pw) — tak terkait migrasi. Performance: `unindexed FK` pada kolom camera baru (INFO, pola sama dengan FK style/subject existing yang juga tanpa index) + `multiple_permissive_policies` admin+user_read (pola baku semua tabel image_*). Tak ada temuan baru yang butuh aksi.
- `config.ts review` (`resolveImageTarget`) tidak disentuh — angle bukan bagian target provider/model/style, murni prompt suffix layer di worker.

## Verifikasi
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 464 passed (59 file) ✓, `npm run build` ✓ (route `angles/[angleSlug]` terdaftar).

## Commit
- `feat(visual): template camera angle configurable + picker studio & review`
