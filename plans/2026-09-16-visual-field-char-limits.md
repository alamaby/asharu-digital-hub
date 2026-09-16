# Batas Karakter Field di Halaman `/admin/visual` (Subject + Camera Angle)

Created: 2026-09-16 09:28:42

## Objective

Tampilkan batas karakter tiap field di form template subjek & camera angle
(`/admin/visual`, `/admin/visual/subjects/[subjectSlug]`, `/admin/visual/angles/[angleSlug]`)
agar user tahu jumlah karakter saat ini dan maksimalnya. Server/DB tetap
sumber kebenaran; counter bersifat informatif + enforcement ringan di client.

## Scope

- `src/lib/admin/visual-limits.ts` (baru) — konstanta batas field
- `src/components/admin/visual/CharCount.tsx` (baru) — komponen counter
- `src/components/admin/visual/CharCount.test.tsx` (baru) — test unit
- `src/components/admin/visual/SubjectForms.tsx`
- `src/components/admin/visual/CameraAngleForms.tsx`
- `src/lib/admin/visual-actions.ts` — pakai konstanta (tanpa ubah perilaku)
- Test: gate typecheck + lint + test

## Milestones

1. Ekstrak konstanta batas + komponen counter
2. Pasang counter di form subjek (add + detail)
3. Pasang counter di form camera angle (add + detail)
4. Gate hijau + commit/push

## Tasks

- [x] Buat `src/lib/admin/visual-limits.ts` (SUBJECT_EN_MIN/MAX, DISPLAY_NAME_MAX, SLUG_MAX)
- [x] Buat `CharCount.tsx` (tabular-nums; amber di bawah min; merah bila lewat max)
- [x] Buat `CharCount.test.tsx`
- [x] `SubjectForms.tsx`: counter `display_name` (n/100), `slug` (n/60), `subject_en` (n/500, amber <10)
- [x] `CameraAngleForms.tsx`: counter `display_name` (n/100), `slug` (n/60), `angle_en` (n/500, amber <10)
- [x] Reset counter saat form tambah sukses (`form.reset()`)
- [x] `visual-actions.ts`: ganti magic number 10/500/60 dengan konstanta
- [x] Gate: `npm run typecheck` + `npm run lint` + `npm test`
- [x] Commit + push

## Risks

- `display_name` tidak punya batas DB/server; max 100 hanya client-side
  (keputusan user) → bukan jaminan keras untuk klien non-browser.
- Counter slug menghitung input mentah, bukan hasil `slugify` (spaces→`-`,
  diacritics strip, truncate 60). Bisa tampak merah di >60 padahal slug final
  selalu ≤60. Versi murah yang disetujui; preview slug live = future.
- Status "over" tidak reachable untuk field ber-`maxLength` (paste/ketik
  ter-clamp); hanya slug yang bisa merah.
- Form visual masih hardcoded Indonesia; counter ikut hardcoded ID (tanpa key
  i18n baru) agar konsisten dengan file sekitarnya.

## Progress Log

- 2026-09-16 09:28:42 — Plan dibuat; keputusan user: display_name max 100
  (client-side saja), cakupan subjek + camera angle.
- 2026-09-16 09:34:00 — Implementasi selesai: `visual-limits.ts`, `CharCount.tsx`
  (+4 test), counter dipasang di 4 form (subjek + angle, add + detail), reset
  counter saat tambah sukses, `visual-actions.ts` pakai konstanta. Gate hijau:
  typecheck ✓ lint ✓ test 674/674 ✓.
- 2026-09-16 09:56:00 — Insiden rewrite: ellipsis Unicode (`…`) di SubjectForms
  vs ASCII (`...`) di CameraAngleForms bikin diff palsu; diperbaiki via
  `git checkout HEAD --` + edit bertarget (diff bersih). Label rentang statis
  dihapus (digantikan counter); re-run gate hijau. Commit + push.

## Notes

- Batas nyata: `subject_en`/`angle_en` CHECK DB 10–500 + validasi server;
  slug `slugify` truncate 60; `display_name` tanpa batas (data existing maks 56).
- Referensi pola counter existing: `StudioForm.tsx:239`, `ContentDraftCard.tsx:274`.
