# Admin Quick Wins + Konsolidasi Admin Auth (1 Sep)

Created: 2026-09-01 10:55

## Objective
Membangun "mode admin" yang koheren: post-login redirect ke dashboard, halaman list semua konten, nav menu khusus admin, dan `profiles.is_admin` sebagai sumber tunggal kebenaran. Pipeline 4-tahap (Discovery→Verification→Scoring→Development) ditunda ke PR terpisah dengan scope penuh (search API + DB baru + LLM tool calling).

## Scope (PR ini)
1. **Konsolidasi admin auth** — `profiles.is_admin` jadi sumber tunggal. Tutup P2 audit #12 sekaligus.
2. **Post-login redirect** ke `/admin` (bukan langsung `/konten/review`).
3. **Halaman dashboard** `/admin` — ringkasan antrian + recent drafts + quick links.
4. **Halaman list** `/admin/konten` — semua content_requests + drafts, filter & sort.
5. **Admin nav menu** — hanya tampil saat login & admin (server-side guard, no flicker).
6. **i18n** + tests + gate + commit + push.

## Di luar scope (PR berikut)
- Pipeline 4-tahap end-to-end (DB baru, search API integration, LLM tool calling, prompt builder baru). Akan dibuat plan file terpisah: `plans/2026-09-01-content-pipeline-4stage.md`.
- Audit findings P2/P3 lain: soft-delete guard scraper, ContentDraftCard error surfacing, duplikasi getServiceClient, rate_limits cleanup, realtime review, INSERT anon limit, middleware matcher persempit, target_category validasi.

## Tasks
- [ ] Plan file
- [ ] Migration `20260901000001_consolidate_admin_auth.sql` — `is_admin()` baca `profiles`; UPSERT admin existing
- [ ] Apply migration ke DB live asharu via MCP
- [ ] `handle_new_user` — hapus hardcoded email (default `is_admin=false`; admin naik via explicit UPDATE)
- [ ] Helper `isAdmin()` server-side di `src/lib/auth/is-admin.ts`
- [ ] Middleware — hapus hardcoded email fallback, pakai `isAdmin()` dari `profiles`
- [ ] Review page — hapus hardcoded email fallback
- [ ] Pathnames: tambah `/admin` + `/admin/konten` di `src/i18n/routing.ts`
- [ ] Exchange page — default `next = /admin` (tetap hormati `?next=`)
- [ ] Navigation config + `NavItem` type — extend untuk admin items
- [ ] `/admin` page (server component) + `DashboardCards` component
- [ ] `/admin/konten` page + `KontenList` (table desktop, card mobile; filter query string; pagination 20)
- [ ] `Header` + `NavMenu`/`MobileNav` — render admin items bila `isAdmin()` true (server)
- [ ] i18n `admin.dashboard` & `admin.konten` di `id.json` & `en.json`
- [ ] Tests: `isAdmin()` helper, admin nav rendering (mocked session), dashboard guard
- [ ] Gate: lint ✓ typecheck ✓ test ✓ build ✓
- [ ] Commit logical (admin auth dulu, lalu quick wins), push
- [ ] Memory entry + README update

## Keputusan
1. **`is_admin()` SQL = `SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)`.** RLS profiles sudah mengizinkan self-read (`id = auth.uid() OR is_admin()`), sehingga caller bisa self-evaluate tanpa chicken-and-egg. Fungsi `STABLE LANGUAGE sql` (bukan SECURITY DEFINER) — cukup untuk caller sendiri.
2. **Admin baru** ditambahkan via explicit `UPDATE profiles SET is_admin = true WHERE email = ...` oleh admin existing (UI/deklaratif, bukan edit kode). `handle_new_user` default ke `is_admin = false` — tidak ada hardcoded email di kode.
3. **Bootstrap admin existing**: migration melakukan UPSERT `profiles.is_admin = true` untuk 2 email yang sebelumnya hardcoded (`alam.aby.b@gmail.com`, `alamaby@gmail.com`). Idempotent.
4. **Middleware latency**: tambah 1 SELECT ke `profiles` per request yang match. Tidak cache — table kecil, query indexed by PK, latency ~ms. Acceptable.
5. **Post-login default**: `next = /admin` (bukan `/konten/review`). `?next=...` tetap dihormati (deep-link aman).
6. **Nav items** (admin): "Dasbor" (`/admin`), "Konten" (`/admin/konten`), "Buat" (`/konten/baru`), "Review" (`/konten/review` — keep untuk akses cepat).
7. **List page** (`/admin/konten`): table di desktop, card list di mobile. Filter query string: `status`, `platform`, `date`, `type`. Sort by `created_at desc` (default). Pagination 20.
8. **Dashboard auto-refresh**: `visibilitychange` event di client; refetch ringkasan saat tab focus. Tidak pakai realtime channel (infra belum siap, P3 audit).
9. **Pathnames**: `/admin` & `/admin/konten` ditambahkan di `routing.ts` (sama untuk id/en — single canonical path).
10. **Commit strategy**: 2 parent commit (1) konsolidasi admin (migration + middleware + review + handle_new_user), (2) quick-wins UI (dashboard + list + nav + redirect + i18n). Submodule: 1 commit (migration). Lebih mudah di-review & rollback per-bagian.

## Risiko
- **Konsolidasi admin blast radius besar** (migration + 4 file kode). Mitigasi: commit terisolasi, gate hijau, observasi.
- **Middleware +1 SELECT** per request — accept, tapi bisa di-cache via `Set-Cookie: is_admin=1` jika nanti bottleneck. Defer.
- **Pathnames baru** — `Link` ke `/admin` tanpa routing entry akan error typecheck. Harus update routing.ts SEBELUM pakai di NavMenu.
- **Open redirect** via `?next=` — saat ini `next` URL param dipakai untuk post-login redirect. Validasi: harus path lokal (`/` diawal, bukan URL eksternal). Cek `exchange/page.tsx` & `/api/auth/callback`. Tambah validasi di PR ini.
- **List page** bisa mahal jika ribuan baris — index pada `(status, created_at desc)` sudah ada? Cek di migration audit. Pagination wajib.
- **Dashboard auto-refresh** bisa ganggu jika user baca dengan teliti. Throttle (mis. 30s cooldown antar refetch).

## Progress Log
- 2026-09-01 10:55 — Plan dibuat. User menyetujui quick wins, search API terpisah (Q1), persistent DB stages (Q2), konsolidasi admin (Q5), scope = quick wins (Q6).
- 2026-09-01 12:30 — Quick wins + konsolidasi admin SELESAI & ter-push. Implementasi: SQL `is_admin()` baca profiles (migration applied via MCP asharu; bootstrap admin existing); `isAdmin()` helper + 4 test; middleware & review page tanpa hardcoded email; pathnames `/admin` & `/admin/konten`; NavMenu pisah items/adminItems; Header async dengan server-side isAdmin; exchange page default `next=/admin` (open-redirect guard); dashboard `/admin` (queue/review/research placeholder/recent/quick actions); list `/admin/konten` (filter query string, table desktop, card mobile, pagination 20); i18n admin.dashboard.* & admin.konten.* di id+en. Gate hijau (lint ✓ typecheck ✓ 177/177 ✓ build ✓ — /admin & /admin/konten SSG-compiled). Push: submodule `2a8215d..7f4a555`, parent `40c739c..017053d`. P2 audit #12 ditutup. Pipeline 4-tahap tetap di luar scope (akan plan terpisah).
