# /admin/visual Mengikuti Pola /admin/llm (List→Detail)

Tanggal: 2026-09-10 18:10 (local). Plan: `plans/2026-09-10-admin-visual-llm-pattern.md`. Keputusan user: detail = halaman terpisah; config model = is_default + display_name + JSON; **tanpa tombol hapus** (nonaktif saja, konsisten admin/llm).

## Yang diminta & dikerjakan
5 titik: (1) list provider image DnD prioritas; (2) list template subjek DnD prioritas; (3) klik provider → detail model+key (DnD + enable/disable); (4) klik model → detail config; (5) klik subjek → detail.

### Routes (3 baru, terverifikasi di build)
- `/admin/visual` (root, dirombak): ProviderBoard (DnD + aktif + counts model/key + link **Kelola**) + SubjectBoard (DnD + aktif + link **Detail**) + AddSubjectForm. Section Model/Keys pindah dari root ke detail.
- `/admin/visual/[providerId]` (baru): header (nama + `ImageBaseUrlForm` + `ImageAccountForm` cloudflare) + ModelsSection + KeysSection, masing-masing Suspense+BoardSkeleton (mirror LLM `[providerId]`).
- `/admin/visual/[providerId]/models/[modelId]` (baru): `ImageModelConfigForm` — is_default (single-default per provider), display_name, JSON config (validasi JSON.parse, **cosmetic: belum dikonsumsi worker**).
- `/admin/visual/subjects/[subjectSlug]` (baru): edit display_name, subject_en (10–500), toggle aktif; slug read-only.
- `src/i18n/routing.ts`: 3 pathname baru didaftarkan (wajib — next-intl Link typecheck menolak pathname tak terdaftar).

### Actions
- `visual-actions.ts`: `reorderImageSubjects(slugs)` → `sort_order=(i+1)*10`; semua subject action kini juga revalidate `/admin/visual/subjects/[subjectSlug]`.
- `image-admin-actions.ts`: **fix bug** `updateImageProviderBaseUrl` (dulu menulis `config.base_url` yang tak dibaca runtime; kini menulis kolom `base_url` yang benar); `updateImageModelConfig` (is_default mematikan sibling di provider sama); helper `revalidateVisualPaths`; `toggleImageModelActive`/`reorderImageKeys`/`toggleImageKeyActive` kini terima `providerId` untuk revalidate detail.

### Komponen
- `SubjectBoard.tsx` (baru): SortableList keyed by **slug** (bukan uuid).
- `ImageBoards.tsx`: provider board + counts + Kelola; model board + link Detail ke config; akun cloudflare pindah dari row ke detail; `ImageModel` type +`config`.
- `ImageForms.tsx`: + `ImageBaseUrlForm`, `ImageModelConfigForm`.
- `SubjectForms.tsx`: `SubjectRowForm` jadi form detail (input sort_order dihapus — urut via DnD).

## Verifikasi
- typecheck ✓, lint ✓, 382/382 tests ✓, build EXIT=0 (3 route baru terdaftar). Fix kecil providerName pasca-gate → gate penuh re-run hijau.
- Submodule `supabase/` tidak berubah (tanpa migrasi); commit parent-only.

## Risks / Catatan jujur
- JSON config model **belum memengaruhi generasi** (dilabeli di form); wiring ke worker = scope terpisah bila diminta.
- Single-default per provider: centang is_default mematikan default sibling — perilaku sedikit berubah dari "first is_default by priority".
- Precedence route: `subjects` (static) menang atas `[providerId]` (dynamic) untuk segmen sama; aman karena providerId uuid.
- QA manual belum: drag provider/subjek, klik Kelola → drag model/key, edit config model (cek is_default sibling), edit subjek, cek base_url tersimpan di kolom.

## Commit
- Parent: `e3e9670` `feat(visual): admin/visual ikut pola admin/llm list-detail dnd`
