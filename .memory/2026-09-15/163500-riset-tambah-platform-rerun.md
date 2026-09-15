# Tambah Platform & Proses Ulang pada Riset Completed/Failed

## Task

Admin ingin bisa menambahkan platform yang sebelumnya tidak dipilih pada riset yang sudah
selesai (mis. menambah `artikel` ke sesi yang hanya `threads`+`twitter`) lalu memproses ulang,
tanpa mengulang discovery/verifikasi/scoring.

## Key Files Changed

- `src/lib/research/platform-additions.ts` (baru) — murni: `isRealPlatformSlug`,
  `resolveEffectivePlatforms`, `computeAddablePlatforms`, `mergeSessionPlatforms`.
- `src/lib/research/platform-additions.test.ts` (baru) — 8 test (multi, tunggal, agnostik, duplikat, nonaktif).
- `src/lib/content/actions.ts` — server action `addPlatformsAndRerun(sessionId, platforms)` (admin-only).
- `src/components/admin/AddPlatformRerun.tsx` (baru) — checkbox platform + tombol, pola `useTransition`.
- `src/app/[locale]/(admin)/admin/riset/[sessionId]/page.tsx` — hitung `addablePlatforms` + render untuk `completed`/`failed`.
- `src/messages/id.json` + `en.json` — 10 key `admin.research.addPlatform*`.
- `plans/2026-09-15-riset-tambah-platform-rerun.md` — plan + progress log.

## Technical / Business Decisions

- **Tanpa migrasi DB.** `platform_slugs text[]` sudah ada (migrasi `20260906000004`).
- **Tanpa ubah state machine.** Pola sama dengan `retrySession`/`advanceToDevelopment`: UPDATE status
  langsung + back-date `current_stage_started_at` 10 menit agar cron `advancePendingSessions`
  (guard 5 menit) langsung memungut. `canTransition`/`isTerminal` tidak disentuh.
- **Idempotensi gratis** dari `runDevelopment` (`development.ts:230-352`) yang sudah per-pasangan
  `pairKey(topik, platform, produk)` — jadi draf platform lama tidak digandakan.
- **Status diizinkan: `completed` + `failed`.** Guard `shortlisted` > 0 wajib; jika 0, arahkan ke
  Resume/Retry (karena `runDevelopment` akan langsung menandai sesi `failed`).
- **Cakupan topik: semua `shortlisted`** (tanpa UI pemilihan topik baru).
- **Proses via cron**, bukan inline (menghindari timeout server action untuk artikel long-form).
- **Normalisasi sesi agnostik:** `platform_slugs = union(platform_slugs, platform_slug, platform draf nyata)`,
  lalu `platform_slug` hanya diisi bila tepat 1 platform. Sesi lama (`[]` + draf `all`) ternormalisasi
  ke daftar eksplisit — disengaja agar `resolveTargetPlatforms` tidak mengekspansi semua platform aktif.
- Keputusan user (3 pertanyaan): `completed`+`failed`; semua topik shortlisted; andalkan cron.

## Assumptions / Risks

- `updated_at` bergeser saat rerun — halaman detail memakainya sebagai "completed at".
- Draf warisan ber-`platform_slug='all'` tidak ikut idempotensi (slug nyata ≠ `all`); hanya risiko
  untuk draf dengan `research_topic_id` null (tidak terjadi di sesi riset modern).
- Mekanisme dua dengan produk tetap nonaktif → rerun `failed` (error disurfacekan, bukan bug baru).
- Mulai proses ≤5 menit (tick cron), bukan instan.

## Blockers / Unresolved

Tidak ada. `plans/2026-09-14-lihat-riset-langsung-detail-admin.md` (untracked, bukan dari tugas ini)
sengaja tidak diikutkan commit.

## Verification

- `npm run typecheck` ✓ (sempat error TS2322 `merged[0]` → diperbaiki dengan `merged[0] ?? null`).
- `npm run lint` ✓
- `npm test` ✓ 618/618 (8 test baru)
- `npm run build` ✓
- Verifikasi live (post-deploy) belum: [USER ACTION] buka sesi `completed` → panel "Tambah Platform &
  Proses Ulang" → pilih `artikel` → cek draf baru & status `developing`/`completed`.

## Commit Proposal

`feat(riset): tambah platform & proses ulang untuk sesi completed/failed`
