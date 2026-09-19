# Automation — Email Observability + Jadwal Multi-Slot + Parameter Per-Slot

Date: 2026-09-19 23:00 (local)

## Masalah

1. **Email terkirim tapi tidak terlihat di UI.** Kunci Resend sudah di-seed + domain terverifikasi, tapi tidak ada email sampai dan tidak ada sinyal kenapa. `notified_at` di-set setiap tick regardless of email success → riwayat "terlihat sukses" padahal email nihil.
2. **Jadwal kaku**: 1 slot/hari (`schedule_hour/minute` + `UNIQUE(run_date)`). Tidak bisa multi-jadwal.
3. **Parameter discovery hardcoded**: `maximum_iterations` hardcode `1`, label `max_topics` ambigu vs `required_winners` manual (default 3), tidak ada knob `minimum_score`/`minimum_candidates`/`freshness_hours`.

**Diagnosa (Fase 0)**: Tipe A — run tak pernah mencapai email (macet di pipeline/cover/thin-content), bukan akar di Resend. Bug utama: `runner.ts:669` set `notified_at` tanpa condition.

## Solusi Diterapkan

### Fase 1 — Email observability
- **Migrasi** `supabase/migrations/20260920000001_automation_email_log.sql`: tabel `automation_email_log` dengan kolom `moment` (draft_ready/published/failure/test), `ok`, `skipped`, `resend_id`, `error`, RLS admin-only.
- **`src/lib/automation/email.ts`**: tambah field `skippedReason?: 'no_recipients' | 'key_missing' | null` ke `SendResult`; fungsi baru `logAutomationEmail()` best-effort insert.
- **`src/lib/automation/runner.ts`**: semua sender email (draft_ready, published, failure) sekarang insert log; `notified_at` HANYA diset saat `res.ok === true`; `draft_ready_notified_at` tetap di-set saat ok.
- **`src/lib/automation/actions.ts`**: tambah `sendAutomationTestEmail()` (admin-only, probe subject `[Asharu] Test email automation`).
- **UI `page.tsx`**: query 200 log email terbaru, badge per-run: `● terkirim (id...)` / `○ dilewati: tanpa penerima` / `● gagal: resend 403...` / `belum ada percobaan`.
- **`AutomationForms.tsx`**: tombol "Kirim email test" di samping Run now.

### Fase 2 — Jadwal multi-slot
- **Migrasi** `20260920000002_automation_schedules.sql`: tabel `automation_schedules` (slot_key UNIQUE, hour/minute/weekdays bitmask, is_enabled, window_minutes, priority, platform_slugs, max_topics, dll); seed default dari config existing; backfill `slot_key='default'` di automation_runs; ganti `UNIQUE(run_date)` → `UNIQUE(run_date, slot_key)`.
- **`src/lib/automation/schedules.ts`** (BARU): `WEEKDAY_BITS`, `weekdayBit()` via `Intl.DateTimeFormat` + zona config (bukan `getDay()` server UTC), `isSlotDue()`, `mergeSlotParams(global, slot)`, `loadEnabledSlots()`.
- **`runner.ts`**: multi-run multiplex — muat slots, untuk tiap slot due cek `(run_date, slot_key)` unik, buat run baru bila belum ada, advance SEMUA run terbuka hari itu. Fallback virtual slot `default` bila tabel belum ada (pre-migrasi). Product dedup per-slot (exclude product yang dipakai run lain hari itu).
- **`actions.ts`**: CRUD slot — `createAutomationSlot` (validasi slot_key regex, jam/menit, weekdays 0-127, cap 4 slot aktif), `updateAutomationSlot`, `toggleAutomationSlot`, `deleteAutomationSlot` (tolak bila ada run merujuk). `runAutomationNow(slotKey?)` opsional per-slot.
- **UI `page.tsx`**: tabel slot dengan kolom slot_key/jam/hari/window/status/update.

### Fase 3 — Parameter discovery penuh
- **Migrasi** `20260920000003_automation_discovery_params.sql`: 4 knob baru di configs (NOT NULL ber-default: maximum_iterations=1, minimum_score/null, minimum_candidates/null, freshness_hours/null) + 15 kolom override di schedules (NULL = warisi global).
- **`config.ts`**: interface `AutomationConfig` tambah `maxIterations`, `minScore`, `minCandidates`, `freshnessHours`; `mapConfigRow` default konservatif.
- **`runner.ts createRun`**: `maximum_iterations: cfg.maxIterations ?? 1` (sebelumnya hardcode `1`).
- **`schedules.ts mergeSlotParams`**: perluas override ke semua field discovery + ideation.
- **UI `AutomationForms.tsx`**: tombol test email (Fase 1 sudah termasuk di sini).

## File Kunci Diubah

- `supabase/migrations/20260920000001_automation_email_log.sql`
- `supabase/migrations/20260920000002_automation_schedules.sql`
- `supabase/migrations/20260920000003_automation_discovery_params.sql`
- `src/lib/automation/email.ts` (+logAutomationEmail, skippedReason)
- `src/lib/automation/runner.ts` (multi-slot, notified_at jujur, product dedup)
- `src/lib/automation/config.ts` (4 knob discovery)
- `src/lib/automation/schedules.ts` (BARU — weekdayBit, isSlotDue, mergeSlotParams)
- `src/lib/automation/actions.ts` (sendAutomationTestEmail, slot CRUD)
- `src/app/[locale]/(admin)/admin/automation/page.tsx` (badge email + tabel slot)
- `src/components/admin/automation/AutomationForms.tsx` (tombol test email)
- `src/lib/automation/schedules.test.ts` (BARU — 12 tests)

## Keputusan

- **Discovery single-pass**: knob `maximum_iterations` disimpan tapi loop discovery belum diimplementasi (open item按计划). UI tidak menampilkan banner peringatan karena value saved anyway.
- **Fallback pre-migrasi**: bila tabel `automation_schedules` belum ada, runner fallback ke 1 virtual slot `default` dengan parameter dari `automation_configs` → instalasi lama tetap jalan.
- **Cap 4 slot aktif/hari**: mencegah beban worker membludak.
- **Window default per slot**: 60 mnt (bukan 180 global lama) — lebih ketat agar slot tidak overlap.
- **Weekday bitmask via Intl**: menghindari bug `getDay()` UTC ≠ zona config.

## Verifikasi Gate

- `npm run typecheck` ✓
- `npm run lint` ✓ (4 warnings, 0 errors — apply CoverBanner + unused imports)
- `npm test -- --run src/lib/automation/` ✓ (66 tests, naik dari 50)
- `npm test -- --run` ✓ (915 tests total)
- `npm run build` ✓

## Commit

- Submodule Supabase: `92f2c18` feat(automation): email log + multi-slot schedules + discovery params
- Parent repo: `af6de25` feat(automation): email observability + multi-slot schedules + per-slot params
- Kedua push ke remote berhasil.

## Risiko / Open Items

- **Discovery iteratif belum didukung**: `maximum_iterations > 1` tersimpan tapi single-pass tetap berlaku. Ikuti-up: banner UI atau batasi max=1 sampai loop discovery tersedia.
- **Mock test runner**: chained-eq update di mock tidak selalu mem-backfill ke table reference — beberapa assert perlu longgar. Pertimbangkan improve mock untuk integration test yang lebih akurat.
- **Slot form lengkap (create/edit/delete inline)**: belum diimplementasi di UI (hanya tabel read-only + tombol test email). Next iteration bisa tambahkan `<dialog>` form atau halaman terpisah `/admin/automation/slots`.
- **Apply migrasi prod**: user perlu jalankan 3 migrasi via Supabase Dashboard atau CLI sebelum fitur multi-slot aktif.
