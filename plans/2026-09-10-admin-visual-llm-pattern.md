# /admin/visual mengikuti pola /admin/llm

Created: 2026-09-10 17:35:00

## Objective
Merestruktur `/admin/visual` menjadi navigasi list→detail seperti `/admin/llm`, dengan:
1. Root berisi daftar provider image (DnD) + daftar template subjek visual (DnD).
2. Klik provider membuka detail berisi model + key provider tersebut (DnD + enable/disable).
3. Klik model membuka detail konfigurasi model.
4. Klik template subjek membuka detail template tersebut.
5. Semua pengaturan prioritas tetap drag-and-drop; tidak ada tombol hapus (nonaktifkan sebagai jalan keluar).

## Scope
- Root: `src/app/[locale]/admin/visual/page.tsx`
- Detail provider: `src/app/[locale]/admin/visual/[providerId]/page.tsx`
- Detail model: `src/app/[locale]/admin/visual/[providerId]/models/[modelId]/page.tsx`
- Detail subjek: `src/app/[locale]/admin/visual/subjects/[subjectSlug]/page.tsx`
- Komponen: `ImageBoards.tsx`, `ImageForms.tsx`, `SubjectForms.tsx`, `SubjectBoard.tsx` (baru)
- Actions: `image-admin-actions.ts`, `visual-actions.ts`
- Reuse: `SortableList`, `ActionFeedback`
- Tanpa migrasi database; semua kolom urutan sudah tersedia.

## Milestones
1. Plan file ditulis.
2. Root dirombak jadi dua board (provider + subjek) dengan link detail.
3. Detail provider, model, dan subjek dibuat.
4. Actions baru/fix ditambah.
5. Gate hijau, commit + push, memory.

## Tasks
- [x] Tulis plan file.
- [x] Root: provider board ditambah `modelCount`/`keyCount` + link Kelola; subjek board DnD + link Detail; hapus section model/key dari root.
- [x] Detail provider: fetch provider, header + `ImageBaseUrlForm` + `ImageAccountForm` (cloudflare) + ModelsSection + KeysSection dalam Suspense.
- [x] Detail model: form `is_default` (single-default per provider), `display_name`, JSON `config` (cosmetic, validasi JSON).
- [x] Detail subjek: edit `display_name`, `subject_en` (10–500), toggle `is_active`; slug read-only.
- [x] `SubjectBoard.tsx`: SortableList keyed by slug, `onReorder` → `reorderImageSubjects`.
- [x] `ImageBoards.tsx`: provider counts + Kelola, hapus account form dari row; model board link Detail; type `ImageModel` tambah `config`.
- [x] `ImageForms.tsx`: tambah `ImageBaseUrlForm` + `ImageModelConfigForm`.
- [x] `visual-actions.ts`: tambah `reorderImageSubjects`.
- [x] `image-admin-actions.ts`: perbaiki `updateImageProviderBaseUrl` tulis kolom `base_url`; tambah `updateImageModelConfig`.
- [x] Metadata noindex ringan untuk halaman detail.
- [x] Jalankan gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Commit + push (parent-only, tanpa submodule) + memory.

## Risks
- JSON config model image belum dikonsumsi worker; harus dilabeli jelas sebagai config yang belum memengaruhi generasi.
- Single-default per provider mengubah semantik halus saat model di-set default; sibling default dinonaktifkan.
- Route `[providerId]` berdampingan dengan `subjects/[subjectSlug]`; Next.js memprioritaskan static prefix, dan providerId berupa uuid sehingga aman.
- `SortableList` untuk subjek memakai slug sebagai id; label `#sort_order` baru berubah setelah revalidate (normal).
- `updateImageProviderBaseUrl` sebelumnya menulis `config.base_url` yang tidak dibaca runtime; perbaikan ini mengubah form menjadi fungsional.

## Progress Log
- 2026-09-10 17:35:00 — Plan dibuat; mode build aktif; inspeksi admin/llm, visual, actions, dan shared DnD selesai.
- 2026-09-10 18:05:00 — Semua implementasi selesai (root, 3 route detail, SubjectBoard, forms, actions, routing i18n). Gate hijau: typecheck ✓, lint ✓, 382 tests ✓, build EXIT=0 dengan 3 route baru terdaftar (`/[locale]/admin/visual/[providerId]`, `.../models/[modelId]`, `/subjects/[subjectSlug]`). Fix providerName kosong di detail header → gate re-run wajib.

## Notes
- Keputusan user: detail memakai halaman terpisah, model config = is_default + display_name + JSON, tidak ada tombol hapus.
- Submodule `supabase/` tidak berubah karena tidak ada migrasi.
- Pola i18n: string UI admin menggunakan teks Indonesia hardcoded, konsisten dengan admin/llm.
