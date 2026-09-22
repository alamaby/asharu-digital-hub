# Automation Slot Forms — CRUD + Run per-slot + Override Penuh

Timestamp: 2026-09-19 23:55 (local time)

## Task

Menghubungkan server action slot yang sudah ada ke UI `/admin/automation` agar admin bisa tambah/edit/nonaktif/hapus slot dan menjalankan tick per-slot, termasuk seluruh 26 field override per-slot Fase 3.

## Key Files Changed

- `src/lib/automation/actions.ts` — tambah helper `numNull`/`triBool`, perluas `updateAutomationSlot` ke 26 override + fix bug `countEnabledSlots` (filter `.eq('is_enabled', true)`) + cap hanya saat slot baru aktif
- `src/components/admin/automation/SlotForms.tsx` — file baru: `SlotSection` + `SlotCreateForm` + `SlotCard` (kolapsibel `<details>` per slot)
- `src/app/[locale]/(admin)/admin/automation/page.tsx` — select diperluas ke 37 kolom, tipe `slotRows` di-expand, tabel diganti `<SlotSection>`, helper `weekdaysLabel` dipindah ke `SlotForms.tsx`, `ConfigRow` + `GlobalDefaults` ditambahkan 4 field discovery
- `src/lib/automation/actions.test.ts` — +5 test (persist 26 override, kosong→NULL, slot_key invalid, hapus default ditolak, mock extended)
- `src/components/admin/automation/SlotForms.test.tsx` — file baru: 5 test (ringkasan jam, tri-state null, Hapus tidak untuk default, render slot, pesan kosong)

## Decisions

- Pola tetap: section + `<details>` per slot (keputusan user final).
- Konvensi kosong = warisi global: null untuk semua field nullable; array/platform kosong = null juga.
- `numNull` helper dibuat khusus untuk override nullable (bukan `num()` supaya `''` tetap null, bukan fallback).
- Cap 4 slot hanya dicek saat `is_enabled=true`; slot nonaktif baru tidak ditolak.

## Risks / Notes

- `AutomationForms.tsx` tetap ≤500 baris (tidak disentuh).
- `slot_key` readonly di form edit (identitas).
- `template_slug` option "Warisi global" + "_bebas" (NULL = warisi; slot tak bisa memaksa Bebas jika global punya template).

## Verification

- `npm run typecheck` ✓
- `npm run lint` ✓ (0 errors, warnings existing)
- `npm test -- --run` ✓ (925 tests)
- `npm run build` ✓

## Commit

- `feat(automation): slot CRUD UI + 26 override per-slot + fix countEnabledSlots`
