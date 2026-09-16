# Batas Karakter Field di `/admin/visual` (Subjek + Camera Angle)

Created: 2026-09-16 09:28:42

## Objective

Menampilkan batas karakter tiap field di form template subjek & camera angle
(`/admin/visual`, `/admin/visual/subjects/[subjectSlug]`,
`/admin/visual/angles/[angleSlug]`) agar user tahu jumlah karakter saat ini dan
maksimalnya. DB/server tetap sumber kebenaran; counter bersifat informatif +
enforcement ringan di client.

## Perubahan

- `src/lib/admin/visual-limits.ts` (baru): `SUBJECT_EN_MIN=10`,
  `SUBJECT_EN_MAX=500`, `DISPLAY_NAME_MAX=100`, `SLUG_MAX=60`.
- `src/components/admin/visual/CharCount.tsx` (baru): counter `{n}/{max}`,
  `tabular-nums`, amber saat `0 < n < min`, merah saat `n > max`, plus `title`.
- `src/components/admin/visual/CharCount.test.tsx` (baru): 4 test.
- `SubjectForms.tsx` & `CameraAngleForms.tsx`: counter di `display_name`
  (n/100 + `maxLength`), `slug` (n/60), `subject_en`/`angle_en` (n/500, amber
  <10); state `useState` + `onInput`; reset counter saat tambah sukses; label
  rentang statis dihapus (digantikan counter).
- `visual-actions.ts`: magic number 10/500/60 diganti konstanta (dipakai
  bersama client; tidak boleh diekspor dari modul `'use server'`).

## Keputusan / Asumsi

- `display_name` tidak punya batas DB/server → max 100 client-side saja
  (keputusan user). Nilai existing maks 56.
- Cakupan diperluas ke camera angle (pola identik) atas persetujuan user.
- Counter slug menghitung input mentah, bukan hasil `slugify`; versi murah ini
  disetujui (preview slug live = future).
- Form visual masih hardcoded Indonesia; counter ikut hardcoded ID.

## Verifikasi

- Gate hijau: `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 674/674 ✓
  (termasuk 4 test `CharCount`).
- Insiden kecil saat rewrite: file asli memakai ellipsis Unicode (`…`) di
  `SubjectForms` tapi ASCII (`...`) di `CameraAngleForms`; rewrite sempat
  menormalkan keduanya → diff palsu. Diperbaiki via `git checkout HEAD --`
  lalu edit bertarget; diff akhir bersih (0 whitespace-only aside line endings
  CRLF yang memang konvensi repo).

## Commit

`feat(admin): tampilkan batas karakter field template visual`
