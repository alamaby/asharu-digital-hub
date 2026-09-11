# Studio Generate Image (User Login)

Created: 2026-09-11 12:00:00

## Objective
User yang login (non-admin) bisa generate image mandiri: pilih provider, model image, template subjek, preset style, aspek rasio; feedback UI jelas tiap aksi; histori prompt + hasil tersimpan 30 hari; semuanya configurable by table.

## Scope
- Rute login-only baru `/studio` (sidebar grup create, `adminOnly:false`)
- Form 5 picker + prompt + histori + polling + retry + hapus + unduh
- Tabel baru: `image_aspect_ratios`, `image_studio_config` (singleton), `user_image_generations`; bucket `user-images`
- Worker antre cron `*/5` (reuse pola review) + cron cleanup harian + kuota harian per-user
- i18n id/en, RLS owner-based, test vitest

## Milestones
1. Migrasi DB di submodule `supabase/` (aspek, config, histori, bucket, RLS, cron) — apply + verifikasi prod
2. Backend: `require-user`, `studio/actions`, `studio-worker`, `POST /api/studio/process`
3. Frontend: routing/nav/middleware + `studio/page` + `StudioForm/History/QuotaBadge` + i18n
4. Gate hijau + commit submodule dulu lalu parent + push + memori

## Tasks
- [ ] Migrasi submodule `supabase/migrations/20260911000002_image_studio.sql` (aspek + config + histori + bucket + RLS + cleanup function + cron)
- [ ] Apply migrasi ke prod via MCP `apply_migration`, verifikasi tabel/RLS/cron
- [ ] `src/lib/auth/require-user.ts` (throw bila anon)
- [ ] `src/lib/studio/actions.ts` (listStudioOptions, enqueueStudioImage + kuota, listUserImages, retry, delete)
- [ ] `src/lib/image/studio-worker.ts` (`processOneUserImage`) + `src/app/api/studio/process/route.ts` + cron `*/5`
- [ ] `src/i18n/routing.ts` pathname `/studio`, `src/config/navigation.ts` NavItem `studio`, `admin-nav.ts` entri create `adminOnly:false`
- [ ] `middleware.ts` guard login-only `/studio` (redirect `/masuk`, tanpa cek admin)
- [ ] `src/app/[locale]/(admin)/studio/page.tsx` (login-only, noindex) + komponen `StudioForm`, `StudioHistory`, `StudioQuotaBadge`
- [ ] i18n `nav.studio` + namespace `studio.*` di `src/messages/id.json` + `en.json`
- [ ] Test vitest (validasi, kuota, expiry, owner isolation) + gate `typecheck/lint/test/build`
- [ ] Commit submodule dulu lalu parent (Conventional Commits 1 baris), push, update `.memory/`

## Risks
- Worker contention draft vs studio (1 pool key) — tick bergantian, monitor `failure_count`
- Abuse biaya — kuota default 20/hari + IP limit lapis-2
- Polling load — interval dari config, stop saat ready/failed
- Migrasi aspect CHECK→FK — aditif dulu (kolom baru nullable, backfill, baru enforce)

## Progress Log
- 2026-09-11 12:00:00 — Plan dibuat dari mode plan; user pilih: semua user login, antre cron, hapus total + kuota. Mulai eksekusi.

## Notes
- Fitur kecil → TOGAF proporsional (fase B/C ringan); bukan rating/billing C2M/ODA sehingga tidak ada deviasi standar.
- Histori dipisah `user_image_generations` (bukan reuse `content_draft_images`) agar tidak merusak partial unique `uq_draft_images_selected` + RLS admin + `draft_id NOT NULL`.
- Studio wajib isi prompt (`allow_empty_prompt=false`) — beda dari review yang boleh reasoning-only.
- File Storage ikut dihapus saat cleanup (user minta hapus total).
