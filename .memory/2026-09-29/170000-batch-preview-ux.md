# Batch form preview UX (blok vs baris)

Date: 2026-09-29 17:00 WIB

## Task
Opsi A follow-up laporan user: 10 prompt valid tapi 2 ditolak >500 char tanpa konteks jelas. Perjelas preview + daftar tolak tanpa ubah spek split.

## Key files changed
- `src/components/studio/BatchForm.tsx` — preview `previewCount {count,lines}`, daftar tolak pakai `rejectedItem` (nomor 1-based + panjang char), hint `splitHint`, notice submit ikut format sama (hapus hardcoded ID + index 0-based).
- `src/lib/studio/validation.ts` — helper murni `countBatchLines`.
- `src/lib/studio/validation.test.ts` — 4 test baru (append).
- `src/messages/id.json`, `src/messages/en.json` — key baru `splitHint`, `rejectedItem`; nilai `previewCount` diubah (key sama).
- `plans/2026-09-29-studio-batch-generate-plan.md` — log progres.

## Decisions
- Split spec tidak diubah (tetap double-newline); hanya presentasi.
- `previewCount` ganti nilai (bukan tambah key) agar tidak ada key mati; parity id/en dijaga + `validate:messages` hijau.
- Panjang blok dihitung ulang di render via `parseBatchPrompts(raw)` (O(n) per keystroke, negligible) agar tidak ada state drift.

## Risks
- Pesan submit yang dulu hardcoded Indonesia kini ikut i18n — perilaku EN berubah (perbaikan, bukan regresi).

## Verification
- typecheck ✓, lint 0 error (16 warning lama), 1198/119 tests ✓, messages ✓, build ✓.

## Commit
n/a — belum commit/push (keputusan memori #7; menunggu instruksi eksplisit).

## Related
- `plans/2026-09-29-studio-batch-generate-plan.md`
