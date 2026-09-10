# Template Subjek + Siapkan Prompt Awal

Created: 2026-09-10 13:30:00

## Objective
Tombol "Siapkan prompt awal" di setiap panel visualisasi review (cover + per-reply): scene postingan via micro-LLM + template subjek configurable (CRUD admin). Keputusan user: ekstraksi LLM, Admin CRUD, dua panel, teks subjek disetujui.

## Scope
- Migrasi `20260910000003_image_subject_templates.sql` (applied prod via MCP)
- `src/lib/image/subjects.ts` (+test), `suggestImagePrompt` di actions
- Dropdown + tombol di DraftImageCard + PostImageControl; wiring review; `/admin/visual` + nav

## Milestones
1. Skema + seed live
2. Suggest + panel dua-duanya
3. CRUD admin + gate hijau

## Tasks
- [x] Tabel `image_subject_templates` + seed wanita-muda-modis + RLS admin (applied + verified SELECT)
- [x] `subjects.ts`: buildSceneMessages/parseSceneJson/composeSubjectPrompt + 6 test
- [x] `suggestImagePrompt` (admin, baca post server-side, micro-LLM 150 token stage image_prompt, tanpa insert DB)
- [x] Dropdown template + tombol di cover & reply (busy, notice, disable konkuren)
- [x] Review wiring (query aktif → options cover + reply)
- [x] `/admin/visual` CRUD-lite (tambah/edit/toggle) + nav Visual + routing + pesan ID/EN
- [x] Gate: typecheck/lint/372 tests hijau

## Risks
- 2 LLM calls per prompt final (scene + enhance) — diterima.
- Scene generik untuk postingan abstrak — user edit sebelum enhance; gate kontradiksi tetap jaga.
- Scene terpotong → error jujur ke notice (bukan seed rusak).
- suggest tanpa rate limit (admin-only; enhance punya 30/jam utk non-admin) — diterima.

## Progress Log
- 2026-09-10 13:30:00 — SELESAI & gate hijau. Submodule commit dulu lalu parent.

## Notes
- C2M/TM Forum tidak relevan (tooling visual internal).
- Pola tambah template via migrasi tetap berfungsi (otomatis muncul di picker).
