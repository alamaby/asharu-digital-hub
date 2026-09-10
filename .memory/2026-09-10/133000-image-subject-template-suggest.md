# Template Subjek + Siapkan Prompt Awal

Tanggal: 2026-09-10 13:30 (local). Plan: `plans/2026-09-10-image-subject-template-suggest.md`. Keputusan user: scene via LLM, Admin CRUD, cover + per-reply, teks subjek disetujui.

## Desain
- Tombol "Siapkan prompt awal" + dropdown template di `DraftImageCard` (cover) dan `PostImageControl` (reply).
- `suggestImagePrompt(draftId, postIndex, subjectSlug)`: baca post server-side → micro-LLM JSON `{activity, setting, objects}` (150 token, stage `image_prompt` → ikut waterfall + cap LOW + audit) → `composeSubjectPrompt` deterministik → textarea. Tanpa insert DB; lanjut Sempurnakan → Generate (existing).
- Tabel `image_subject_templates` (slug PK, display_name, subject_en 10–500, is_active, sort_order) + seed `wanita-muda-modis` + RLS admin (meniru style presets). Applied prod via MCP, verified SELECT.
- `/admin/visual` CRUD-lite (tambah/edit/toggle + notice) + nav "Visual" (routing + config + pesan ID/EN).

## File diubah
- `supabase/migrations/20260910000003_image_subject_templates.sql` (submodule)
- `src/lib/image/subjects.ts` + `subjects.test.ts` (6 test)
- `src/lib/image/actions.ts` (`suggestImagePrompt`), `src/lib/admin/visual-actions.ts` (baru)
- `DraftImageCard.tsx`, `PostImageControl.tsx`, `ContentDraftCard.tsx` (options), review `[draftId]/page.tsx` (query subjects)
- `src/app/[locale]/admin/visual/page.tsx` + `components/admin/visual/SubjectForms.tsx` (baru)
- `routing.ts`, `config/navigation.ts`, `messages/id|en.json` (nav adminVisual)

## Keputusan / trade-off
- 2 calls per prompt final (diterima); scene gagal → error jujur, bukan seed rusak.
- suggest tanpa rate limit (admin-only).
- Notice hardcode ID (konsisten panel review).

## Verifikasi
- `typecheck` ✓, `lint` ✓, `npm test` 372/372 (49 files, parity ID/EN) ✓.
- Belum QA klik manual (butuh deploy + cron tidak diperlukan — suggest sinkron).

## Commit
- submodule: `feat(db): template subjek visualisasi`
- parent: `feat(review): siapkan prompt awal dari template subjek`
