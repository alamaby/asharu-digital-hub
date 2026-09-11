# Studio Generate Image (User Login)

## Task
Tambah menu generate image untuk user login (bukan hanya admin). User pilih provider, model image, template subjek, preset style, aspek rasio; feedback UI jelas tiap aksi; histori prompt + hasil tersimpan 30 hari; semuanya configurable by table.

## Files Changed
- `plans/2026-09-11-studio-generate-image.md` — plan dokumen
- `supabase/migrations/20260911000002_image_studio.sql` — tabel `image_aspect_ratios`, `image_studio_config`, `user_image_generations`; bucket `user-images`; RLS + cron worker/cleanup (submodule commit `46280cc`)
- `src/lib/auth/require-user.ts` — guard login-only
- `src/lib/studio/{types,validation,actions,storage,worker}.ts` — backend studio
- `src/lib/studio/validation.test.ts` — 7 test (validasi panjang, provider↔model link, expiry, kuota)
- `src/app/api/studio/process/route.ts`, `src/app/api/studio/cleanup/route.ts` — cron worker + daily cleanup
- `src/app/[locale]/(admin)/studio/page.tsx` — halaman login-only
- `src/components/studio/{StudioForm,StudioHistory,StudioPageClient}.tsx` — UI picker + polling + retry + hapus + unduh
- `src/config/navigation.ts`, `src/i18n/routing.ts`, `src/components/admin/shell/admin-nav.ts`, `src/middleware.ts` — routing/nav/login-only guard
- `src/messages/id.json`, `en.json` — i18n `nav.studio`, `meta.studio`, namespace `studio.*`

## Decisions / Assumptions
- Audience: semua user login (adminOnly:false di sidebar), bukan admin-only.
- Eksekusi: antre cron (*/5, ≤5/tick) — reuse pola review — bukan sync, biaya & load lebih rendah.
- Retensi: hapus total (row + Storage file) via cron harian; kuota default 20/hari per user (config override / null unlimited).
- Histori dipisah `user_image_generations` (bukan `content_draft_images`) agar tidak rusak partial unique `uq_draft_images_selected`.
- Studio wajib isi prompt (`allow_empty_prompt=false`) — beda dari review yang boleh reasoning-only.
- Aspek pake tabel baru `image_aspect_ratios` (FK) — tidak sentuh CHECK lama di `image_gen_defaults` (legacy review).

## Risks / Open
- Abuse biaya: kuota default 20/hari + IP rate-limit lapis-2; turunkan bila tagihan naik.
- Worker contention draft vs studio (1 pool key bersama): tick bergantian, pantau `failure_count`.
- `studio/worker.ts` belum diuji integrasi penuh (provider mock) — hanya validation logic diuji unit. Worker butuh provider key di Vault untuk smoke test prod.
- P2: realtime `supabase.channel` belum (polling tiap N detik cukup untuk UX ini).
- i18n EN studio namespace belum diverifikasi rendering — cek di prod `/en/studio`.

## Verification
- typecheck ✓, lint ✓, test 413 passed (7 baru) ✓, build ✓ (`/id/studio`, `/en/studio`, `/api/studio/process`, `/api/studio/cleanup` dynamic SSR).
- Migrasi apply prod verified via MCP: 5 aspek aktif, `image_studio_config` retention_days=30 daily_limit=20, bucket `user-images` ada.
- Commit: submodule `46280cc` dulu lalu parent `1ea2e36` (24 file), push OK.

## Commit Proposal
feat(studio): generate image menu for logged-in users with 30d history
