# Admin Automation History, Anti-Repeat Produk, Visual Crash, Featured Verification

Tanggal: 2026-09-22 133000 (Asia/Jakarta)

## Ringkasan

4 finding terkonfirmasi ditangani tanpa desain ulang:

1. **Riwayat run `admin/automation`** — sebelumnya tanpa pagination, tanpa card produk, tanpa jam mulai/selesai, tanpa nama topik. Kini: 10/halaman, filter status/slot, search `q` (produk+topik cap 50 ID), card `FixedProductCard`, jam HH:mm + durasi, topik utama via `pickPrimaryTopic`.
2. **Produk automation重复 (HUAWEI Band 11 Series 2x)** — akar: tidak ada memori lintas-hari. Fix: blackout global 14 hari (knob 0–90) + fallback L1/L2/L3 berjenjang + log `pool/occupied/blackout/fallback`.
3. **Crash deterministik `TypeError: Cannot read properties of undefined (reading 'sort_order')`** di `admin/visual` — akar: state `ids` SortableList sinkron via `setTimeout` berlomba dengan Flight props baru; `renderItem` pakai `!` non-null assertion. Fix: S1 useEffect sync, S2/S3 null-safe renderItem, S4 try/catch counts provider, S5 test growth+shrink.
4. **Verifikasi featured** — tanpa ubah kode: carousel home = top-6 `ORDER BY featured_rank ASC, created_at DESC` + filter `featured_override !== false`; admin pin swap oldest via `planFeaturedOverride` (MAX_CURATED=6).

## File Kunci Diubah

- `src/components/admin/llm/SortableList.tsx` — useEffect sync ids
- `src/components/admin/visual/SubjectBoard.tsx` — null-safe renderItem
- `src/components/admin/visual/CameraAngleBoard.tsx` — null-safe renderItem
- `src/app/[locale]/(admin)/admin/visual/page.tsx` — try/catch counts provider
- `src/app/[locale]/(admin)/admin/automation/page.tsx` — pagination+filter+search+render
- `src/lib/admin/automation-runs-query.ts` — helper murni (new)
- `src/lib/automation/config.ts` — productBlackoutDays field
- `src/lib/automation/schedules.ts` — mergeSlotParams blackoutDays
- `src/lib/automation/scheduler.ts` — blackoutCutoff() export
- `src/lib/automation/runner.ts` — L1/L2/L3 fallback + log
- `src/lib/automation/actions.ts` — store product_repeat_blackout_days
- `src/components/admin/automation/AutomationForms.tsx` — knob input 0–90
- `supabase/migrations/20260922000003_automation_product_blackout.sql` — DB columns

Test baru: `SortableList.test.tsx`, `SubjectBoard.test.tsx`, `CameraAngleBoard.test.tsx`, `automation-runs-query.test.ts` (+ test新增 di config/schedules/scheduler/runner/actions).

## Gate Final

- `npm run typecheck` ✓
- `npm run lint` ✓ (0 errors, 11 warnings pre-existing)
- `npm test` ✓ 1044 tests (106 files)
- Commit parent `88ccf83` + plan `9bd4657` pushed
- Submodule `d7627d1` pushed
- Migrasi prod APPLIED via MCP `20260922000003_automation_product_blackout`

## Open Questions Tercatat di Plan

- OQ-1: Cap resolver `q` = 50 ID (dipakai, aman untuk instalasi <50 produk cocok)
- OQ-2: Filter tanggal run ditunda
- OQ-3: Cutoff blackout = aritmetika tanggal kalender atas run_date
- OQ-4: Interleaving Flight exact crash — kelas crash tertutup fix S1–S3

## Handoff Opsional untuk User

- `/id/admin/automation`: verifikasi riwayat run 10/halaman + card + jam + topik
- Tambah subject/angle 3x di `/id/admin/visual`: tanpa error page
- Blackout: 2 sesi beruntun → produk berbeda (pantau log `fallback=`)
- Knob blackout 0–90 tersimpan di config form
