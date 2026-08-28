# Content Factory Fase 1 — Fix Temuan Review

Created: 2026-08-28 22:55:00

## Objective
Perbaiki temuan review Fase 1 agar sesuai plan `2026-08-28-content-factory-workflow.md` sebelum lanjut Fase 2.

## Temuan

### CRITICAL
1. **Migration FK order bug** — `llm_call_logs` dibuat sebelum `content_requests`/`content_drafts`, sehingga FK `REFERENCES` gagal saat `supabase db push` (`relation "content_requests" does not exist`). [supabase/migrations/20260828000000_content_factory.sql:143]
2. **Submodule pointer stale** — parent commit `b72a086` merekam `supabase@b460ff1` (empty), bukan `bc2c8e5` yang berisi migration + config. `git clone --recurse-submodules` akan checkout kosong.

### MAJOR
3. **Middleware guard hilang** — plan Fase 1: `middleware.ts` harus guard `/konten/review` (redirect ke `/masuk` jika anon atau bukan admin). Implementasi saat ini hanya refresh session (`supabase.auth.getUser()`), tidak ada guard.
4. **Callback `getAll` salah** — `src/app/api/auth/callback/route.ts:22` `getAll() { return []; }` tidak membaca cookie dari `request`, sehingga `exchangeCodeForSession` tidak bisa set cookie via `request` (harus pakai `next/headers` atau `NextRequest`).
5. **Env placeholder tidak valid untuk build** — `.env.example` berisi `https://REPLACE.supabase.co` (lolos regex) tapi `SUPABASE_SERVICE_ROLE_KEY=REPLACE_...` (min 20) tetap lolos; namun jika user copy-paste tanpa ganti, `hasSupabase=true` (karena URL+anon ada) padahal key dummy → runtime error. Seharusnya placeholder bikin `hasSupabase=false` sampai diganti (pakai empty/default).
6. **Sitemap belum exclude konten** — `src/app/sitemap.ts` / `lib/seo/metadata.ts` belum set `noindex` untuk `/konten/*` (plan Fase 3, tapi Fase 1 sudah expose `/masuk` tanpa meta guard).

### MINOR
7. **Vault ext tidak di config** — `supabase/config.toml` tidak mention `vault`/`pgsodium` enable, padahal migration komen “enabled per-project”. Perlu dokumentasi.
8. **LoginForm redirect locale** — `window.location.origin + "/api/auth/callback"` hardcode tanpa `?next` locale-aware. Seharusnya pakai `getPathname`/`routing`.

## Fix Plan

- [x] 1. Migration: pindah `llm_call_logs` CREATE ke **setelah** `content_requests` + `content_drafts` (commit `5bfa9f1` di submodule).
- [x] 2. Submodule: `git add supabase` di parent agar pointer update ke `5bfa9f1`.
- [x] 3. Middleware: tambah guard — jika `pathname` match `/{locale}/konten/review` dan `!user` atau `!is_admin`, redirect ke `/{locale}/masuk`.
- [x] 4. Callback: ganti `request: Request` → `NextRequest`, `getAll() { return request.cookies.getAll() }`.
- [x] 5. Env: ubah `.env.example` Supabase values jadi kosong sehingga `hasSupabase=false` sampai user isi.
- [ ] 6. (Opsional Fase 1) Tambah `src/app/sitemap.ts` filter: exclude `/masuk`, `/konten/*` dari sitemap. — Ditunda ke Fase 3 (noindex di page metadata).
- [x] 7. Gate: `lint typecheck test build` ✓ (152 tests, typecheck, build hijau).

## Verifikasi
- `supabase db push --dry-run` (atau `psql` parse) tidak error FK.
- `git clone --recurse-submodules` checkout migration.
- `curl /id/konten/review` tanpa session → 307 ke `/id/masuk`.
- `.env.example` copy → `npm run build` tetap hijau (hasSupabase=false path).

## Progress Log
- 2026-08-28 22:55 — Temuan dicatat, fix direncanakan.
- 2026-08-28 23:00 — Fix dieksekusi: migrasi FK di-reorder, middleware guard ditambah, callback NextRequest, env placeholder dikosongkan, submodule pointer update ke `5bfa9f1`. Gate hijau (lint ✓ typecheck ✓ 152 ✓ build ✓). Commit `fix(content): fase 1 review fixes` + push.
