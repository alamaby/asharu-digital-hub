# Studio Generate Image (User Login)

Created: 2026-09-11 12:00:00

## Objective
User yang login (non-admin) bisa generate image mandiri: pilih provider, model image, template subjek, preset style, aspek rasio; feedback UI jelas tiap aksi; histori prompt + hasil 30 hari; semuanya configurable by table.

## Scope
- Rute login-only baru `/studio` (sidebar grup create, `adminOnly:false`)
- Form 5 picker + prompt + histori + polling + retry + hapus + unduh
- Tabel baru: `image_aspect_ratios`, `image_studio_config` (singleton), `user_image_generations`; bucket `user-images`
- Worker antre cron `*/5` (reuse pola review) + cron cleanup harian + kuota harian per user
- i18n id/en, RLS owner-based, test

## Milestones
1. Migrasi DB di submodule `supabase/` (aspek, config, histori, bucket, RLS, cron) — apply + verifikasi prod ✅
2. Backend: `require-user`, `studio/actions`, `studio-worker`, `POST /api/studio/process` ✅
3. Frontend: routing/nav/middleware + `studio/page` + `StudioForm/History/QuotaBadge` + i18n ✅
4. Gate hijau + commit submodule dulu lalu parent + push + memori ✅

## Tasks
- [x] Migrasi submodule `supabase/migrations/20260911000002_image_studio.sql`
- [x] Apply migrasi ke prod via MCP `apply_migration`, verifikasi tabel/RLS/cron
- [x] `src/lib/auth/require-user.ts` (throw bila anon)
- [x] `src/lib/studio/actions.ts` (listStudioOptions, enqueueStudioImage + kuota, listUserImages, retry, delete)
- [x] `src/lib/studio/worker.ts` (`processOneStudioImage`) + `src/app/api/studio/process/route.ts` + cron `*/5`
- [x] `src/i18n/routing.ts` pathname `/studio`, `src/config/navigation.ts` NavItem `studio`, `admin-nav.ts` entri create `adminOnly:false`
- [x] `middleware.ts` guard login-only `/studio` (redirect `/masuk`, tanpa cek admin)
- [x] `src/app/[locale]/(admin)/studio/page.tsx` + komponen `StudioForm`, `StudioHistory` + i18n
- [x] i18n `nav.studio` + namespace `studio.*` + `meta.studio` di `id.json` + `en.json`
- [x] Test vitest (validation: prompt length, provider/model link, expiry, kuota) + gate `typecheck/lint/test/build`

## Risks
- Worker contention draft vs studio (1 pool key) → tick bergantian, monitor `failure_count`
- Abuse biaya → kuota default 20/hari + IP limit lapis-2; turunkan bila tagihan naik
- Polling load → interval dari config, stop saat ready/failed
- Migrasi aspect CHECK→FK → aditif via tabel baru `image_aspect_ratios` (tidak mengubah CHECK lama)

## Progress Log
- 2026-09-11 12:00:00 — Plan dibuat dari mode plan; user pilih: semua user login, antre cron, hapus total + kuota. Mulai eksekusi.
- 2026-09-11 12:30:00 — Migrasi + server + frontend selesai. typecheck✓ lint✓ test 413 passed✓ build✓. Commit submodule `46280cc` dulu, lalu parent `1ea2e36` (24 file). Push OK.

## Notes
- Histori dipisah `user_image_generations` (bukan reuse `content_draft_images`) agar tidak merusak partial unique `uq_draft_images_selected` + RLS admin + `draft_id NOT NULL`.
- Studio wajib isi prompt (`allow_empty_prompt=false` default) — beda dari review yang boleh reasoning-only.
- File Storage `user-images/{userId}/{id}.ext` ikut dihapus saat cleanup (user minta hapus total).
- `image_gen_defaults.aspect` CHECK tetap (legacy review); studio pake `image_aspect_ratios` FK.
- `meta.studio` routing harus ditambahkan ke `buildMetadata()` path agar title/description konsisten — sudah ada via `meta.konten`-style namespace.
