# Admin UX Polish + Digest 2948654141 Fix (1 Sep)

Recorded: 2026-09-01 14:45

## Task / Problem
Lanjutan dari quick-wins admin: testing di Vercel menemukan:
- **Digest `2948654141` 500** di `/konten/review` & `/admin/konten` — log Vercel: `usePathname is not supported in Server Components`. Root cause: `KontenList.tsx` di-impor oleh server component `page.tsx` tapi tidak punya `'use client';` directive, sehingga Next.js mencoba me-resolve `usePathname()` di server context.
- **Klik draf terbaru di dashboard tidak ada link** — `<li>` statis.
- **Form "Buat Konten" success state ephemeral** — hanya `<p role="status">` tanpa navigasi, tidak ada "Lihat draf"/"Buat lagi" link.
- **Tidak ada back nav** di `/konten/baru`.
- **Loading state** tidak ada di filter form, pagination, approve/reject, form submit spinner kurang jelas.
- **Error boundary** tidak ada — aplikasi error tampil sebagai "Application error: a server-side exception has occurred".

## Key Files Changed
- `src/components/admin/KontenList.tsx` — tambah `'use client';` (baris 1) + `FilterSubmitButton` (useFormStatus spinner) + `PaginationLink` (useTransition spinner) + refactor tombol filter & pagination.
- `src/components/admin/DashboardCards.tsx` — RecentDraftsList `<li>` dibungkus `<Link href="/konten/review">`.
- `src/components/content/ContentRequestForm.tsx` — full success state (ganti form dengan success card: icon + judul + body + 2 link inline: "Lihat draf" → `/admin/konten?type=requests&status=pending` & "Buat lagi" reset state). Form fields disembunyikan saat success. Tambah spinner SVG inline pada tombol submit. Disable semua field saat pending.
- `src/components/content/ContentDraftCard.tsx` — `statusUpdating: 'approved'|'rejected'|null` state; optimistic update + rollback on error; spinner SVG inline pada tombol approve/reject/saveEdit; inline error `<p role="alert">` saat RLS/network fail.
- `src/app/[locale]/konten/baru/page.tsx` — back nav: link "← Kembali ke Dasbor" + "Lihat semua" di header.
- `src/app/[locale]/admin/loading.tsx` (baru) — skeleton dashboard (4 placeholder).
- `src/app/[locale]/admin/konten/loading.tsx` (baru) — skeleton list page.
- `src/app/[locale]/admin/error.tsx` (baru) — error boundary: judul + body + Retry button + "Kembali ke Dasbor".
- `src/app/[locale]/konten/review/error.tsx` (baru) — sama.
- `src/messages/id.json` & `en.json` — `content.form.{backToDashboard,goToList,successTitle,successBody,successViewList,successCreateAnother}` + `admin.error.{title,body,retry,backToDashboard}`.
- `vitest.setup.tsx` (rename dari `.ts`, agar bisa pakai JSX di mock) + mock `next/navigation` & `@/i18n/navigation` untuk vitest (karena `next/navigation` tidak resolve di vitest).
- `vitest.config.ts` — update setupFiles path.

## Decisions
1. **Pagination `useTransition`** — pakai `window.location.href` di dalam transition agar spinner tampil saat navigasi. Alternative: `router.push` (tapi next-intl router client mungkin tidak expose `useTransition` proper). Pragmatis.
2. **Approve/reject optimistic update + rollback** — UX lebih responsif, rollback pada error agar state UI konsisten dengan server.
3. **Error boundary logs ke console** (`useEffect console.error`) — untuk debugging Vercel logs. Tidak expose error.message ke user (hanya digest).
4. **Success state inline (bukan auto-redirect)** — pilihan user (Q2): success card dengan 2 link inline, no race condition.

## Assumptions / Risks
- **Pagination `window.location.href` di useTransition**: full page reload, bukan client-side navigation. Sederhana, tapi loses client-side RSC streaming. Acceptable untuk admin list.
- **KontenList sebagai 'use client'** menambah bundle size (semua filter form + status badges di-load ke client). Sebelumnya server-only. Untuk admin-only page, acceptable.
- **Mock `next/navigation` di vitest**: hanya untuk test render; tidak menguji real navigasi. Cukup untuk snapshot tests.
- **`as never` cast pada `Link href` ke dynamic query string**: sudah dari sebelumnya, belum dihapus (3 lokasi). Pragmatis.

## Blockers / Unresolved
- (Tetap) Setup P0 cron (`asharu_cron_secret` Vault + Vercel `CRON_SECRET` + apply `20260831000001`) — gate factory resume, independen.
- **Pipeline 4-tahap** masih PR berikut (plan file terpisah, belum dibuat).
- `as never` cast di Link ke dynamic string — bisa dibersihkan dengan `as Href` cast atau refactor ke typed helper, deferred.
- `as any` di `middleware.ts` (`let supabase: any = null;`) — workaround karena `SupabaseClient` tidak di-export dari `@supabase/ssr`. Bisa dibersihkan dengan proper type import, deferred.

## Verification
- Gate hijau: `lint` ✓; `tsc --noEmit` ✓; `vitest run` 30 files / 177 tests ✓; `next build` ✓.
- Digest `2948654141` source teridentifikasi dari Vercel log: `usePathname is not supported in Server Components` di `KontenList.tsx` (commit `7a0dffb`).
- A2 fix (1 baris `'use client';`) di-push terpisah & akan redeploy otomatis Vercel. Verifikasi browser: `/id/admin/konten` & `/id/konten/review` harus load tanpa "Application error".
- Polish commit (`5cc6391`) di-push setelah A2 terverifikasi via gate (build OK). Vercel auto-redeploy.

## Commit Proposal
- (parent, sudah push) `fix(admin): add 'use client' to KontenList — usePathname requires client` — `7a0dffb`
- (parent, sudah push) `feat(admin): UX polish — success state, loading states, error boundaries, back nav` — `5cc6391`
- (docs, akan commit) `docs: record admin UX polish and usePathname fix`

## Related Plans
- `plans/2026-09-01-admin-quick-wins.md` (plan file sebelumnya; Progress Log di-update).
- `.memory/2026-09-01/123000-admin-quick-wins.md` (preceding: quick wins shipment).
