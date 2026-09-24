# Automation Slot Forms — CRUD + Run per-slot + Override Penuh

Created: 2026-09-19 23:45:00

## Objective

Menyambungkan server action slot yang sudah ada ke UI `/admin/automation` sehingga admin bisa tambah / edit / nonaktif / hapus slot dan menjalankan tick per-slot, termasuk seluruh 26 field override per-slot Fase 3. Hasil akhir: file baru `src/components/admin/automation/SlotForms.tsx` (karena `AutomationForms.tsx` sudah 394 baris — menambah form slot di sana melanggar batas 500 baris), `page.tsx` me-render `SlotSection` sebagai ganti tabel slot read-only, semua aksi memakai pola `useNotice` + `PendingButton` + `ActionNoticeView` yang sudah ada, gate hijau.

Keputusan user yang sudah final (jangan ditanya ulang): (a) cakupan **penuh semua override**, (b) pola **section + `<details>` per slot**.

## Scope

- Masuk:
  - Perluas `updateAutomationSlot` di `src/lib/automation/actions.ts:355-377` untuk 26 kolom override (saat ini hanya 7 field jadwal) dengan konvensi `kosong → NULL` (= warisi global).
  - Perbaiki bug `countEnabledSlots` di `src/lib/automation/actions.ts:301-310` (saat ini menghitung semua baris tanpa filter `is_enabled`, tidak sesuai pesan "maksimal 4 slot aktif").
  - File baru `src/components/admin/automation/SlotForms.tsx`: `SlotSection` + `SlotCreateForm` + `SlotCard` (ringkasan + tombol Run per-slot + Toggle + Hapus + `<details>` edit & override).
  - Wiring `page.tsx`: perluas select `automation_schedules` + tipe `slotRows`, teruskan `slotRows`/`platformRows`/`templateRows`/nilai global ke `SlotSection`.
  - Tests: +5 di `actions.test.ts`, file baru `SlotForms.test.tsx` (3–4 test, mengikuti pola `AutomationForms.test.tsx`).
- Tidak termasuk (jangan dikerjakan):
  - Mengubah runner / `mergeSlotParams` (sudah benar) dan migrasi baru (skema 37 kolom sudah cukup).
  - Rename `slot_key` di form edit (`slot_key` adalah identitas; update memakai `.eq('slot_key', …)`).
  - i18n label form (halaman admin existing berbahasa Indonesia).
  - Menghapus tabel slot read-only sebelum `SlotSection` terbukti render (ganti hanya setelah kartu jalan).

## Milestones

1. Fase 0 — Baca kode wajib (read-only, tanpa ubah apa pun).
2. M1 — Action diperluas + bug cap diperbaiki, tests action hijau.
3. M2 — `SlotForms.tsx` selesai (tambah + edit + toggle + hapus + run per-slot).
4. M3 — Wiring `page.tsx` (select diperluas + props diteruskan, tabel diganti kartu).
5. M4 — Gate penuh + memory/commit/push.

## Tasks

### Fase 0 — Baca (WAJIB sebelum koding)

- [ ] Baca sampai paham (jangan skip):
  - `src/lib/automation/actions.ts:1-60` (helper `bool`/`num`/`str`/`listValues`/`csv`/`checkboxValues`, `requireAdmin`, `automationOk/Fail`), `:155-175` (`runAutomationNow(slotKey?)`), `:300-422` (slot CRUD + `SLOT_KEY_RE` + `MAX_ENABLED_SLOTS_PER_DAY`).
  - `src/components/admin/automation/AutomationForms.tsx:1-51` (pola `useNotice`/`toNotice`), `:107-108` (`inputCls`/`labelCls`), `:327-364` (tombol Run now + test email + refresh), `:371-394` (`RetryRunForm` — pola tombol kecil + notice inline).
  - `src/components/admin/automation/AutomationForms.test.tsx` (pola mock action + render; tiru untuk `SlotForms.test.tsx`).
  - `src/components/admin/llm/ActionFeedback.tsx` (`ActionNoticeView`, `PendingButton`, tipe `ActionNotice`).
  - `src/app/[locale]/(admin)/admin/automation/page.tsx:192-225` (query + tipe `slotRows`), `:267-310` (tabel slot yang akan diganti).
  - `src/lib/automation/actions.test.ts` (struktur mock `isAdmin`/`createSupabaseService`/`revalidatePath`; perluas mock `from()` untuk tabel `automation_schedules` + `automation_runs`).
  - `src/lib/automation/schedules.ts` (`mergeSlotParams` — daftar field override yang harus dipersist action).
- [ ] Catat 1 baris di Progress Log bahwa Fase 0 selesai + temuan apa pun (mis. `ConfigRow`/`ConfigFormData` belum punya 4 field discovery — lihat M3.1).

### M1 — Perluas action slot (`src/lib/automation/actions.ts`)

- [ ] M1.1 Tambah 2 helper nullable (JANGAN pakai `num()` untuk override nullable — `num('')` mengembalikan fallback sehingga menulis non-null dan merusak konvensi warisi):
```ts
function numNull(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
/** Select tri-state ""/"true"/"false" → null/true/false. */
function triBool(form: FormData, key: string): boolean | null {
  const raw = form.get(key);
  if (raw == null || raw === '') return null;
  return raw === 'true';
}
```
- [ ] M1.2 Perluas `updateAutomationSlot`: selain 7 field existing, tambah 26 override ke `patch` (contoh pola per tipe):
  - Angka-nullable: `max_topics: numNull(formData, 'max_topics')` — validasi `null || 1–10`, dst. (daftar validasi lengkap di tabel bawah).
  - Teks-nullable: `product_category: str(formData, 'product_category')` (`str` existing sudah `'' → null`), `language/tone/audience/purpose/cta_style/email_from/email_reply_to/template_slug` sama.
  - Boolean tri-state: `auto_publish_article: triBool(…)`, `require_cover`, `idea_generation_enabled`, `idea_product_search`.
  - Array (kosong = warisi, sesuai keputusan Fase 3): `platform_slugs: (() => { const v = checkboxValues(formData, 'platform_slugs'); return v.length ? v : null; })()`, `notify_emails` via `csv(...)` dengan pola sama.
  - `notify_on`: `str(...)` + whitelist `draft_ready/published/both/none`, kosong → `NULL`.
  - `target_reply_count`: `numNull` + validasi `null || 1–10`.
- [ ] Tabel validasi (cerminkan CHECK DB persis):
  - `hour` 0–23, `minute` 0–59, `weekdays` 0–127, `window_minutes` null/5–720, `max_topics` null/1–10, `product_pool_size` null/1–500, `maximum_iterations` null/1–5, `minimum_score` null/0–100, `minimum_candidates` null/1–50, `freshness_hours` null/1–720, `cover_max_wait_minutes` null/5–720, `cover_max_attempts` null/1–10, `max_retry_attempts` null/0–10, `target_reply_count` null/1–10.
- [ ] M1.3 Perbaiki `countEnabledSlots`: tambah `.eq('is_enabled', true)`; di `createAutomationSlot` terapkan cap `>= 4` HANYA bila slot baru `is_enabled=true` (slot nonaktif baru tidak boleh ditolak).
- [ ] M1.4 `actions.test.ts` +5: (1) persist 26 override penuh; (2) string/angka kosong → `NULL`; (3) `slot_key` invalid (`'Pagi!'`, 33 char) ditolak; (4) hapus `default` ditolak; (5) hapus slot yang masih punya run ditolak (mock `automation_runs` select count). Perluas mock `from()` untuk `automation_schedules` (insert/update/delete/select) + `automation_runs` (select count).

### M2 — `SlotForms.tsx` baru (client component, pola = `AutomationForms.tsx`)

- [ ] M2.1 Kerangka + tipe:
```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createAutomationSlot, updateAutomationSlot, toggleAutomationSlot, deleteAutomationSlot, runAutomationNow, type AutomationActionResult } from '@/lib/automation/actions';
import { ActionNoticeView, PendingButton, type ActionNotice } from '../llm/ActionFeedback';
```
  - Salin helper `toNotice`/`useNotice` dan konstanta `inputCls`/`labelCls` (duplikasi 20 baris disengaja — jangan refactor `AutomationForms.tsx` agar diff kecil).
  - `SlotFormData`: semua kolom slot nullable sesuai DB (contoh: `max_topics: number | null`, `notify_on: string | null`, …).
  - `GlobalDefaults`: subset nilai global untuk placeholder (`max_topics`, `product_pool_size`, `language`, … — ambil dari `ConfigFormData` + 4 field discovery; bila `ConfigFormData` belum punya discovery, lihat M3.1).
- [ ] M2.2 `SlotCreateForm`: field `slot_key` (editable, `pattern="[a-z0-9-]{1,32}"`, `title` berisi aturan), `label`, `hour`, `minute`, `weekdays` (number 0–127 + teks bantuan `127 setiap hari · 31 Senin–Jumat · 96 Sabtu–Minggu`), `window_minutes` (kosong = default 60), `priority`, checkbox `is_enabled` (default checked). Submit → `createAutomationSlot(fd)` → notice + `router.refresh()`.
- [ ] M2.3 `SlotCard({ slot, platforms, templates, globalDefaults })`:
  - Ringkasan selalu terlihat: `label` + `slot_key` mono + `HH:MM` + hari (helper `weekdaysLabel`, salin dari `page.tsx:228-241`) + window + badge aktif/nonaktif.
  - Tombol: Run per-slot (`runAutomationNow(slot.slot_key)`), Toggle (`toggleAutomationSlot`), Hapus (`deleteAutomationSlot` + `window.confirm('Hapus slot …?')`; untuk `default` JANGAN render tombol Hapus; pesan server bila ditolak karena run merujuk sudah jelas).
  - `<details><summary>Edit & override</summary><form action={handleUpdate}>` berisi: hidden `slot_key` + teks `slot_key` readonly, 7 field jadwal, lalu section override: Discovery (`maximum_iterations`, `minimum_score`, `minimum_candidates`, `freshness_hours`), Cover & retry (`cover_max_wait_minutes`, `cover_max_attempts`, `max_retry_attempts`), Platform & produk (`platform_slugs` checkbox group + helper "kosongkan semua = warisi global", `product_pool_size`, `product_category`, `template_slug` select Warisi + daftar template), Gaya (`language` select Warisi + id/en/both, `tone`, `audience`, `purpose`, `cta_style`, `target_reply_count`), Notifikasi (`notify_on` select Warisi + 4 opsi, `notify_emails` input koma + helper, `email_from`, `email_reply_to`), Ideation + Publish (4 boolean via select tri-state Warisi/Ya/Tidak + `auto_publish_article` tri-state).
  - Placeholder tiap override: `Warisi global (${globalDefaults.x ?? '—'})`; `defaultValue`: `slot.x ?? ''` untuk teks/angka, `slot.x == null ? '' : String(slot.x)` untuk select tri-state, checkbox platform `defaultChecked={slot.platform_slugs?.includes(slug)}`.
  - Notice per kartu: 2 hook (`saveNotice` untuk form edit, `actNotice` untuk tombol) — JANGAN satu notice bersama untuk semua kartu.
- [ ] M2.4 `SlotSection({ slots, platforms, templates, globalDefaults })`: render `SlotCreateForm` + daftar `SlotCard`. Bila `slots` kosong tampilkan teks sama dengan sekarang ("Belum ada slot — migrasi … belum dijalankan").

### M3 — Wiring `page.tsx`

- [ ] M3.1 Perluas select `automation_schedules` (`page.tsx:209-215`) ke 37 kolom (semua kecuali `id`): `slot_key, label, hour, minute, weekdays, is_enabled, window_minutes, priority, platform_slugs, max_topics, product_pool_size, product_category, auto_publish_article, require_cover, notify_on, notify_emails, maximum_iterations, minimum_score, minimum_candidates, freshness_hours, cover_max_wait_minutes, cover_max_attempts, max_retry_attempts, language, tone, audience, purpose, cta_style, target_reply_count, template_slug, idea_generation_enabled, idea_product_search, email_from, email_reply_to, updated_at`. Perluas tipe `slotRows` (`page.tsx:222-225`) mengikuti.
  - Pitfall: bila `ConfigRow`/`toConfigFormData`/`ConfigFormData` belum memuat `maximum_iterations/minimum_score/minimum_candidates/freshness_hours`, tambah dulu (tipe + mapping) agar placeholder warisan discovery tidak `undefined`.
- [ ] M3.2 Ganti tabel slot read-only (`page.tsx:267-310`) dengan `<SlotSection slots={slotRows} platformRows={platformRows} templateRows={templateRows} globalDefaults={…} />`. Pindahkan helper `weekdaysLabel` ke `SlotForms.tsx` (hapus dari `page.tsx` agar tidak duplikat). Kartu run + badge email JANGAN diubah.

### M4 — Tests baru

- [ ] M4.1 `SlotForms.test.tsx` (3–4 test, tiru `AutomationForms.test.tsx`): render kartu menampilkan `slot_key`/jam; select tri-state default `Warisi` saat nilai null; tombol Hapus tidak dirender untuk `default`; submit edit memanggil `updateAutomationSlot` (mock via `vi.mock('@/lib/automation/actions')`).
- [ ] M4.2 Pastikan `scheduler.test.ts` existing tetap hijau (`isRunDue` JANGAN dihapus).

### M5 — Gate, memory, commit (eksekutor)

- [ ] M5.1 Gate WAJIB berurutan: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Aturan final: setiap edit setelah gate hijau MEMBATALKAN gate — re-run `typecheck` + `lint` (+ `build` bila menyentuh pola runtime).
- [ ] M5.2 Checklist pra-commit: `git status --short`, `git diff`, `git log --oneline -10`; stage hanya file dimaksud; scan secret (`.env*`, `sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`). Submodule `supabase/` TIDAK tersentuh (tanpa migrasi baru) — jangan commit pointer submodule.
- [ ] M5.3 Tulis 1 entri `.memory/YYYY-MM-DD/HHmmss-automation-slot-forms.md` + update `.memory/README.md` hanya bila state/keputusan/blocker berubah. Commit Conventional Commits satu baris tanpa trailer, push, laporkan hash + file kunci.
- [ ] M5.4 Selama eksekusi, update file plan ini: centang `Tasks`, tambah baris dated di Progress Log (selesai/pending/blocked + bukti gate).

## Risks

- Halaman berat: 34 input × N slot. Mitigasi: override di `<details>` tertutup default; hanya 7 field jadwal + tombol yang selalu terlihat. Counter-argumen: tabel inline-edit lebih ringkas tapi tidak muat 26 override + tri-state — ditolak sesuai keputusan user.
- Konvensi kosong = warisi membingungkan. Mitigasi: placeholder `Warisi global (…)` + satu baris helper per section; konsisten dengan keputusan Fase 3.
- Jebakan `num()` untuk nullable: `num('')` mengembalikan fallback (menulis non-null, merusak warisan). Mitigasi: helper `numNull` wajib (M1.1); review diff khusus untuk pemakaian `num(` pada field nullable.
- Checkbox platform tak tercentang = ambigu (warisi vs sengaja kosong). Mitigasi: helper "kosongkan semua = warisi global" (keputusan Fase 3: kosong = warisi, tanpa opsi "tanpa platform" eksplisit).
- `template_slug` eksplisit-Bebas tak terekspresikan (NULL = warisi; bila global punya template, slot tak bisa memaksa Bebas). Diterima sebagai limitasi terdokumentasi; follow-up bila dibutuhkan.
- `slot_key` rename mustahil (identitas update). Mitigasi: readonly di form edit; dokumentasikan di helper text create ("tidak bisa diubah setelah dibuat").
- Cap 4 slot: bug hitung-tanpa-filter menunda kegagalan sampai slot nonaktif pun ditolak. Mitigasi M1.3 + test cap enabled-vs-nonaktif.

## Progress Log

- 2026-09-19 23:45:00 — Plan dibuat untuk eksekutor less-capable (baca kode + perluasan action + SlotForms + wiring + tests + gate). Belum ada eksekusi.
- 2026-09-19 23:55:00 — Semua milestone selesai. Gate hijau: typecheck ✓, lint ✓ (0 errors), test 925/925 ✓, build ✓. Commit `6048280` pushed ke main.

## Notes

- Pola repo yang dipertahankan: server action → `AutomationActionResult` → `useNotice` + `PendingButton` + `ActionNoticeView`; `revalidatePath('/admin/automation')`; validasi ganda app-level + CHECK DB; RLS admin-only; runner hanya membaca slot via `loadEnabledSlots` + `mergeSlotParams` (tidak diubah plan ini).
- Bukan domain telecom/billing → C2M/TM Forum ODA tidak relevan; TOGAF proporsional tanpa ceremony enterprise.
- File kunci: `src/lib/automation/actions.ts`, `src/components/admin/automation/SlotForms.tsx` (baru), `src/app/[locale]/(admin)/admin/automation/page.tsx`, `src/components/admin/automation/AutomationForms.tsx` (baca saja, disentuh minimal), `src/lib/automation/actions.test.ts`, `src/components/admin/automation/SlotForms.test.tsx` (baru), `src/lib/automation/schedules.ts` (baca saja — daftar override).
- Kriteria selesai (definition of done): tambah/edit/toggle/hapus/run-per-slot berfungsi dari UI dengan notice inline; override kosong kembali ke NULL (cek via query `automation_schedules`); `AutomationForms.tsx` tetap ≤500 baris; gate 4 perintah hijau; tidak ada file secret ter-commit.
