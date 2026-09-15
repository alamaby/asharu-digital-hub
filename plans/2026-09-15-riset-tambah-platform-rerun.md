# Riset: Tambah Platform & Proses Ulang (completed/failed)

Created: 2026-09-15 16:35:00

## Objective

Memberi admin cara menambahkan platform yang sebelumnya tidak dipilih pada sesi riset
yang sudah selesai (`completed`) atau gagal (`failed`) di `/admin/riset/[sessionId]`,
lalu menjalankan ulang tahap `developing` — menghasilkan draf untuk platform baru saja,
tanpa mengulang discovery/verification/scoring.

Contoh kasus: sesi selesai dengan platform `threads` + `twitter`, admin ingin menambahkan
`artikel` → draf artikel dibuat untuk topik ber-status `shortlisted`, draf lama tetap utuh.

## Scope

- Fungsi murni resolver platform efektif + kandidat platform yang bisa ditambahkan.
- Server action `addPlatformsAndRerun(sessionId, slugs)` (admin-only, guard status/topik).
- Komponen UI checkbox platform + tombol di halaman detail sesi riset.
- i18n id/en.
- Tampil untuk status `completed` + `failed`; cakupan topik = semua `shortlisted`;
  proses dijalankan oleh cron (tanpa panggilan LLM inline).

Non-goals: tanpa migrasi DB, tanpa ubah state machine, tanpa UI pemilihan topik.

## Milestones

1. Fase 1 — Logika murni + test
2. Fase 2 — Server action + komponen UI + wiring halaman
3. Fase 3 — i18n + gate (typecheck/lint/test) + commit/push

## Tasks

- [x] Tulis plan file ini
- [x] `src/lib/research/platform-additions.ts` — `resolveEffectivePlatforms` + `computeAddablePlatforms`
- [x] `src/lib/research/platform-additions.test.ts` — multi, tunggal, agnostik, duplikat, nonaktif
- [x] Server action `addPlatformsAndRerun` di `src/lib/content/actions.ts`
- [x] Komponen `src/components/admin/AddPlatformRerun.tsx`
- [x] Wire ke `src/app/[locale]/(admin)/admin/riset/[sessionId]/page.tsx`
- [x] Key i18n `src/messages/id.json` + `en.json`
- [x] Gate `npm run typecheck` + `npm run lint` + `npm test` (618) + `npm run build`
- [ ] Commit + push

## Risks

- Sesi agnostik (sesi lama `platform_slugs=[]`, draf `all`) akan ternormalisasi ke daftar
  eksplisit saat rerun — label header berubah. Disengaja: jika tidak, `resolveTargetPlatforms`
  akan mengekspansi SEMUA platform aktif dan membuat draf tak diminta.
- Draf warisan ber-`platform_slug='all'` tidak ikut idempotensi `pairKey` (slug nyata ≠ `all`).
  Hanya berisiko untuk draf dengan `research_topic_id` null; tidak terjadi di sesi riset modern.
- `completed` tidak lagi terminal untuk sesi yang ditambahi platform; jejak audit hanya di
  `content_research_logs`. `updated_at` ikut berubah (dipakai sebagai "completed at").
- Mekanisme dua dengan produk tetap nonaktif → rerun `failed` (error disurfacekan, bukan bug baru).
- Tanpa panggilan LLM inline: mulai ≤5 menit (tick cron) seperti `advanceToDevelopment`.

## Progress Log

- 2026-09-15 16:05:00 — Plan dibuat. Keputusan user: status `completed` + `failed`; topik = semua
  `shortlisted`; proses via cron (bukan inline). Investigasi kode: `runDevelopment` sudah
  idempoten per pasangan `topik × platform × produk` (`development.ts:230-352`), resolver tunggal
  `resolveTargetPlatforms` (`development.ts:143`), cron `advancePendingSessions` (`orchestrator.ts:306`).
- 2026-09-15 16:22:00 — Implementasi selesai. Gate hijau: typecheck ✓, lint ✓, test 618/618 ✓,
  build ✓. Catatan: guard tanpa topik shortlisted (arahkan ke Resume/Retry) ditambahkan karena
  `runDevelopment` menandai sesi `failed` saat tidak ada topik shortlisted.
- 2026-09-15 16:35:00 — Selaraskan centang Tasks & Progress Log; commit + push (aturan AGENTS.md repo).

## Notes

- Referensi pola: `retrySession`/`advanceToDevelopment` di `src/lib/content/actions.ts`
  (update status + back-date `current_stage_started_at` agar cron langsung memungut).
- Tidak ada perubahan skema; `platform_slugs text[]` sudah ada sejak migrasi
  `20260906000004_draft_platform_session_platforms.sql`.
