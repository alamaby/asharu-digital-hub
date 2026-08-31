# Admin Quick Wins + Konsolidasi Admin Auth (1 Sep)

Recorded: 2026-09-01 12:30

## Task / Problem
Lanjutan dari fix bug localhost magic-link URL: user menambahkan 4 permintaan baru — (1) post-login redirect ke halaman dashboard (bukan langsung `/konten/review`), (2) halaman list semua konten, (3) navigasi menu khusus admin, (4) proses pembuatan konten menjadi iteratif 4-tahap (Discovery→Verification→Scoring→Content Development). Scope PR ini diputuskan sebagai quick wins (1-3) + konsolidasi admin auth; pipeline 4-tahap (4) ditunda ke PR terpisah dengan scope penuh (search API, DB baru, LLM tool calling).

## Key Files Changed

### Submodule (supabase)
- `migrations/20260901000001_consolidate_admin_auth.sql` — `is_admin()` baca `profiles.is_admin`; `handle_new_user()` default `is_admin=false` (hapus hardcoded 2 email); UPSERT admin existing. P2 audit #12 ditutup.

### Parent
- `src/lib/auth/is-admin.ts` (baru) — `isAdmin()` server-side helper: `getUser` + `profiles.is_admin` SELECT. Single source of truth.
- `src/lib/auth/is-admin.test.ts` (baru) — 4 test (no user / is_admin=true / false / missing profile).
- `src/middleware.ts` — hapus hardcoded email, profile lookup via `supabase.from('profiles').select('is_admin')`. Var `supabase` di-elevate ke outer scope agar bisa dipakai di guard block.
- `src/app/[locale]/konten/review/page.tsx` — hapus hardcoded email fallback, hanya `profiles.is_admin`.
- `src/app/[locale]/auth/exchange/page.tsx` — default `next` ke `/admin` (hormati `?next=…` valid; open-redirect guard: harus `/${path}`, bukan `//`).
- `src/i18n/routing.ts` — tambah pathnames `/admin` & `/admin/konten`.
- `src/config/navigation.ts` — extend `NavItem` type (4 admin keys); pisahkan `mainNavItems` (publik) & `adminNavItems` (admin).
- `src/components/layout/NavMenu.tsx` — terima `items` & `adminItems` props, render admin section dengan separator/label "Admin" (mobile) atau divider (desktop).
- `src/components/layout/MobileNav.tsx` — terima `adminItems` prop, pass ke NavMenu.
- `src/components/layout/Header.tsx` — `async` RSC; panggil `isAdmin()`, pass ke NavMenu & MobileNav.
- `src/app/[locale]/admin/page.tsx` (baru) — dashboard: greeting, queue cards (pending/failed), review count, research placeholder, recent drafts (5), quick actions.
- `src/app/[locale]/admin/konten/page.tsx` (baru) — list page: filter (status, type, platform, date, sort) via query string, table desktop / card mobile, pagination 20.
- `src/components/admin/DashboardCards.tsx` (baru) — view layer dashboard.
- `src/components/admin/KontenList.tsx` (baru) — view layer list (table+card responsive + filter form + pagination).
- `src/messages/id.json` & `en.json` — `nav.{adminLabel,adminDashboard,adminKonten,adminBaru,adminReview}` + namespace `admin.dashboard.*` & `admin.konten.*`.

## Decisions
1. **`profiles.is_admin` jadi single source of truth** (P2 #12 ditutup). Tidak ada lagi hardcoded email di SQL/TS. Admin baru di-elevate via `UPDATE profiles SET is_admin = true`.
2. **Post-login default** = `/admin`; `?next=…` dihormati dengan open-redirect guard (path harus `/${path}`, bukan eksternal).
3. **Admin nav** muncul server-side (no flicker): Header async, panggil `isAdmin()`, render items accordingly.
4. **List pagination**: 20 item/page; filter & sort via query string agar shareable.
5. **Dashboard auto-refresh** di-defer (P3 audit); saat ini static RSC.
6. **Pipeline 4-tahap** ditunda ke PR berikut dengan scope penuh: search API integration, DB baru (`research_sessions`, `research_topics`), LLM tool calling, prompt builder baru, admin UX research dashboard.

## Assumptions / Risks
- **Middleware +1 SELECT profiles** per matched request. Low cardinality, indexed by PK. Acceptable. Cache via Set-Cookie bisa di-defer.
- **`as never` cast** untuk `Link` href ke dynamic query string (next-intl typed Link dengan strict pathname union) — pragmatic, 2 lokasi. Alternative: gunakan `next/link` untyped (kehilangan i18n auto-translate).
- **Paginasi per-table (requests + drafts terpisah)** dalam mode "both" — total count dihitung dari keduanya. UX mungkin sedikit membingungkan; alternatif: gabung UNION dengan satu pagination. Defer.
- **Dashboard & list page** menggunakan service client (bypass RLS) — admin sudah diverifikasi; counts & reads lebih reliable. Helper `isAdmin()` tetap pakai anon client.
- **Open items lain (P2/P3) tetap open**: realtime review, soft-delete guard scraper, ContentDraftCard error surfacing, duplikasi getServiceClient, rate_limits cleanup, INSERT anon limit, target_category validasi, middleware matcher persempit.

## Blockers / Unresolved
- (Tetap) Setup P0 cron (`asharu_cron_secret` Vault + Vercel `CRON_SECRET` + apply `20260831000001`) — gate factory resume, independen.
- **Pipeline 4-tahap** belum mulai — akan dibuat plan file terpisah `plans/2026-09-01-content-pipeline-4stage.md` (placeholder; belum ditulis).

## Verification
- Gate hijau: `lint` ✓; `tsc --noEmit` ✓; `vitest run` 30 files / 177 tests ✓ (+4 isAdmin); `next build` ✓ (route `/[locale]/admin` & `/[locale]/admin/konten` SSG-compiled).
- DB live verified (MCP asharu): `is_admin()` body baru (SELECT EXISTS dari profiles), profiles 1 user `is_admin=true` (bootstrap OK).

## Commit Proposal
- (submodule, sudah push) `fix(db): consolidate admin auth — profiles.is_admin is single source of truth` — `7f4a555`
- (parent, sudah push) `feat(admin): dashboard + content list, admin nav, profiles.is_admin single source of truth` — `017053d`
- (docs, akan commit) `docs: record admin quick wins in plan and memory`

## Related Plans
- `plans/2026-09-01-admin-quick-wins.md` (tasks diceklist; Progress Log di-update).
- `.memory/2026-08-31/094000-fase2-p1-llm-key-retry-hardening.md` (preceding: Fase 2 P1 hardening + magic-link).
