# Admin List Page i18n + Loading Feedback Fix (1 Sep)

Recorded: 2026-09-01 16:25

## Task / Problem
Setelah deploy commit `5cc6391` (admin UX polish), user melaporkan:
- Halaman `/admin/konten` (list) menampilkan **literal translation keys** seperti `admin.konten.title`, `ADMIN.KONTEN.FILTERSTATUS`, `admin.konten.typeDrafts`, dll — bukan translated values.
- Tombol "Terapkan" (Apply) dan "Reset" hardcoded.
- Tidak ada loading indicator saat submit filter atau navigasi pagination (spinner tidak pernah muncul).

## Key Files Changed
- `src/lib/i18n/client-messages.ts` — tambah `'admin'` ke `CLIENT_MESSAGE_NAMESPACES`. **Root cause**: namespace `admin` tidak masuk ke client bundle, sehingga `useTranslations('admin.konten')` di client component `KontenList` return key sebagai fallback (next-intl fallback ke key string saat namespace tidak ada).
- `src/messages/{id,en}.json` — tambah `admin.konten.{apply,reset}`.
- `src/components/admin/KontenList.tsx`:
  - Form action GET → `<form onSubmit={...}>` client-handled dengan `router.push` di dalam `startTransition` (useTransition). Pending state dipakai bersama oleh tombol Apply & pagination links.
  - `useFormStatus` dihapus (tidak jalan untuk native GET form — `useFormStatus` hanya untuk Server Action forms).
  - `useNavigation` tidak tersedia di Next 15.5.23 (diperkenalkan di Next 16); fallback ke `useRouter` + `useTransition` pattern.
  - Inline tombol Apply dengan spinner SVG (saat `isPending`).
  - `PaginationLink` jadi `<button onClick={() => startTransition(router.push)}>` dengan spinner.
  - Hardcoded "Terapkan"/"Reset" → `t('apply')`/`t('reset')`.
- `vitest.setup.tsx` — hapus mock `useNavigation` (tidak ada di Next 15.5.23).

## Decisions
1. **`useRouter` + `useTransition`** (bukan `useFormStatus` atau `useNavigation`) — paling compatible dengan Next 15.5.23 + native GET form (yang sudah di-convert ke client-handled onSubmit). Pending state shared antara Apply button & pagination.
2. **Client-handled form onSubmit** (bukan `<form action={pathname} method="get">`) — agar navigasi via `router.push` masuk ke React transition (bukan full reload). Pending state ke-track.
3. **Pagination jadi `<button>`** (bukan `<Link>`) — agar klik bisa wrap dalam `startTransition`. Link otomatis navigasi tanpa transition integration di Next 15.
4. **Admin namespace masuk client bundle** — menambah ukuran RSC payload ~6KB (manageable). Trade-off acceptable karena hanya untuk halaman admin.

## Assumptions / Risks
- **`<button>` untuk pagination** mengurangi aksesibilitas (sebelumnya `<Link>` support keyboard nav & middle-click). Mitigasi: button tetap bisa di-tab + Enter; middle-click tidak jalan (acceptable untuk admin).
- **Filter form `onSubmit` di `useTransition`** — saat transition, semua click lain ter-blocked. Form fields lain tidak ter-disable. Mitigasi acceptable (form pendek, transition cepat).
- **RSC payload + admin namespace** — setiap locale (id/en) akan include admin keys di initial bundle. Bisa di-mitigasi dengan dynamic import admin page di kemudian hari. Defer.

## Blockers / Unresolved
- (Tetap) Setup P0 cron (gate factory resume).
- **Pipeline 4-tahap** masih plan berikutnya.

## Verification
- Gate hijau: `lint` ✓; `tsc --noEmit` ✓; `vitest run` 30 files / 177 tests ✓; `next build` ✓.
- Root cause confirmed via screenshot: literal translation keys di `KontenList` karena `admin` namespace tidak masuk `CLIENT_MESSAGE_NAMESPACES` → `pickClientMessages` prune → `useTranslations` return key string.

## Commit Proposal
- (parent, sudah push) `fix(admin): register admin namespace in client bundle, replace useFormStatus with useTransition` — `ed81738`
- (docs, akan commit) `docs: record admin list page i18n and loading feedback fix`

## Related Plans
- `plans/2026-09-01-admin-quick-wins.md` (plan file sebelumnya; Progress Log di-update).
- `.memory/2026-09-01/144500-admin-ux-polish-and-digest-fix.md` (preceding: UX polish).
