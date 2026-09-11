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
- [x] `middleware.ts` guard login-only `/studio` (redirect `/masuk`, tanpa cek admin) — kini via refactor whitelist login-default (commit `5dc047a`)
- [x] `src/app/[locale]/(admin)/studio/page.tsx` + komponen `StudioForm`, `StudioHistory` + i18n
- [x] i18n `nav.studio` + namespace `studio.*` + `meta.studio` di `id.json` + `en.json`
- [x] Test vitest (validation: prompt length, provider/model link, expiry, kuota) + gate `typecheck/lint/test/build`
- [x] Test cakupan namespace client (walk `src/`, 4 assert: anti-dinamis, allow-list ⊆, katalog id.json, allow-list valid) — uji negatif terbukti gagal bila namespace fiktif

## Risks
- Worker contention draft vs studio (1 pool key) → tick bergantian, monitor `failure_count`
- Abuse biaya → kuota default 20/hari + IP limit lapis-2; turunkan bila tagihan naik
- Polling load → interval dari config, stop saat ready/failed
- Migrasi aspect CHECK→FK → aditif via tabel baru `image_aspect_ratios` (tidak mengubah CHECK lama)

## Progress Log
- 2026-09-11 12:00:00 — Plan dibuat dari mode plan; user pilih: semua user login, antre cron, hapus total + kuota. Mulai eksekusi.
- 2026-09-11 12:30:00 — Migrasi + server + frontend selesai. typecheck✓ lint✓ test 413 passed✓ build✓. Commit submodule `46280cc` dulu, lalu parent `1ea2e36` (24 file). Push OK.
- 2026-09-11 15:30:00 — Follow-up label mentah: akar masalah = namespace `studio` tidak masuk `CLIENT_MESSAGE_NAMESPACES` (client hanya terima allow-list) + key `history.downloading` hilang + string hardcoded di `metaLabel`/placeholder/aria/alt/counter + bug textarea ter-disable saat prompt kosong. Fix: allow-list + 6 key baru id/en (`downloading`, `processing`, `noImage`, `loadError`, `imageAlt`, `prevSlide`, `nextSlide`) + semua string via key + `fieldsDisabled` (input aktif saat prompt kosong) + `quota.exhausted` saat limit habis. Test baru `StudioUi.test.tsx` (6 test render label/bug) + extend `client-messages.test.ts`. Gate: typecheck✓ lint✓ test 453 passed✓ build✓.
- 2026-09-11 16:15:00 — Test cakupan namespace client (`client-messages.test.ts` blok `client namespace coverage`): walk `src/` (skip `*.test.*`), deteksi client via direktif `'use client'`/boundary file, ekstrak argumen literal `useTranslations`. 4 assert: (1) tolak argumen dinamis (Assert 4 disetujui user), (2) setiap root namespace client ⊆ allow-list, (3) setiap root ada di `id.json`, (4) setiap entri allow-list ada di katalog. Uji negatif: namespace fiktif `studioXXXX` membuat 2 assert gagal (terbukti menangkap). Audit: semua namespace client saat ini sudah tercakup (tanpa ubah allow-list). Batasan: komponen server yang diimpor client tidak terpindai (belum pernah terjadi). Gate: typecheck✓ lint✓ test 457 passed✓.

## Notes
- Histori dipisah `user_image_generations` (bukan reuse `content_draft_images`) agar tidak merusak partial unique `uq_draft_images_selected` + RLS admin + `draft_id NOT NULL`.
- Studio wajib isi prompt (`allow_empty_prompt=false` default) — beda dari review yang boleh reasoning-only.
- File Storage `user-images/{userId}/{id}.ext` ikut dihapus saat cleanup (user minta hapus total).
- `image_gen_defaults.aspect` CHECK tetap (legacy review); studio pake `image_aspect_ratios` FK.
- `meta.studio` routing harus ditambahkan ke `buildMetadata()` path agar title/description konsisten — sudah ada via `meta.konten`-style namespace.
