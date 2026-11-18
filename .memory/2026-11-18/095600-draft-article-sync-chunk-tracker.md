# Sinkronisasi Dual-Lifecycle Artikel & Tracker Progres Chunked Development

Date: 2026-11-18 09:56 WIB
Commit: proposed (feat(research): sync article draft lifecycle and track chunked development progress)
Plan: [2026-11-18-explicit-state-machines.md](file:///C:/Works/github.com/alamaby/asharu-digital-hub/plans/2026-11-18-explicit-state-machines.md)

## Task & Problem
1. **Dual-Lifecycle Inconsistency (`articles` vs `content_drafts`)**:
   - Menolak atau me-reset persetujuan draf artikel (`rejectArticleDraft`, `resetArticleApproval`) sebelumnya meninggalkan baris di `articles` tetap dalam status `published`. Akibatnya muncul "zombie published articles" di situs publik (`/artikel`), padahal draf induknya telah ditolak atau dikembalikan ke tahap revisi.
   - Mengarsipkan satu artikel bahasa (`archiveArticle`) tidak menyelaraskan status `content_drafts.status` ketika seluruh bahasa telah ditarik dari publikasi.
2. **Implicit Multi-Chunk Research State (`developing`)**:
   - Tahap `developing` pada sesi riset dijalankan secara chunked (`DEVELOP_PAIRS_PER_TICK`) oleh cron background per 5 menit untuk mencegah timeout serverless Vercel.
   - Sesi bertahan dalam status statis `developing` tanpa indikator kuantitatif berapa draf yang sudah disusun dan berapa draf yang tersisa, sehingga menyulitkan admin/agen membedakan apakah sesi sedang aktif berprogres atau mengalami kemacetan (*stuck*).

## Key Files Modified
- [src/lib/articles/actions.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/articles/actions.ts):
  - `archiveArticle`: Mengecek kelengkapan arsip seluruh locale untuk `draft_id` terkait. Jika semua locale sudah terarsip (tidak ada lagi yang `published`), status draf di-update ke `needs_review`.
  - `rejectArticleDraft`: Otomatis mengarsipkan artikel aktif (`status = 'archived'`) saat draf ditolak.
  - `resetArticleApproval`: Otomatis mengarsipkan artikel aktif (`status = 'archived'`) saat persetujuan draf di-reset ke `needs_review`.
- [src/lib/research/development.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/research/development.ts):
  - Interface `DevelopmentProgress` dan fungsi `calculateDevelopmentProgress` untuk menghitung pasangan topik × target platform × produk (total, selesai, tersisa, persentase, dan kelengkapan).
- [src/app/[locale]/(admin)/konten/riset/[sessionId]/page.tsx](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/app/[locale]/(admin)/konten/riset/[sessionId]/page.tsx):
  - Merender visual progress bar dan status numerik (mis. "4 dari 6 draf (67%)") saat sesi berada di status `developing`.
- [src/lib/articles/actions-article-edit.test.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/articles/actions-article-edit.test.ts):
  - Menambahkan pengujian `archiveArticle` (sinkronisasi status draf), `rejectArticleDraft` (auto-archive artikel terbit), dan `resetArticleApproval` (auto-archive artikel terbit).
- [src/lib/research/development.test.ts](file:///C:/Works/github.com/alamaby/asharu-digital-hub/src/lib/research/development.test.ts):
  - Menambahkan pengujian `calculateDevelopmentProgress` untuk skenario session tidak ditemukan, 0%, 50%, dan 100% complete.

## Technical & Business Decisions
- **Non-Destructive Synchronization**: Penarikan artikel ke status `archived` menjaga integritas data tanpa operasi `DELETE` destruktif. Jika artikel nantinya diperbaiki dan disetujui kembali melalui alur standar `approveArticleAndPublish`, baris yang sama akan dipublikasikan ulang secara mulus.
- **Pure Domain Metric Calculation**: `calculateDevelopmentProgress` membaca relasi sesi, topik berstatus `shortlisted`, platform target aktif, dan entri `content_drafts` yang ada tanpa mengubah skema tabel ataupun memerlukan kolom status baru di Postgres.

## Verification
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 warnings/errors.
- `npm test` — 141 test files passed, 1396 tests passed.

## Proposed Conventional Commit
`feat(research): sync article draft lifecycle and track chunked development progress`
