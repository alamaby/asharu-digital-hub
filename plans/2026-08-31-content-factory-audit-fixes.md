# Fix P0 Audit — Auth Processor Endpoint (Bearer Cron Secret)

Created: 2026-08-31 09:00:00

## Objective
Menutup P0 audit 2026-08-30: `/api/content/process` tidak lagi menerima header `x-vercel-cron` yang spoofable; satu-satunya jalur sah adalah `Authorization: Bearer <CRON_SECRET>`, dengan secret yang sama dipakai pg_cron (dibaca dari Supabase Vault, bukan literal di migration) dan wajib diset di Vercel env.

## Scope
- `src/lib/content/cron-auth.ts` (baru) — `isCronAuthorized(request, options?)`: Bearer-only, `timingSafeEqual`, fail-closed di produksi bila `CRON_SECRET` kosong (dev tanpa secret tetap boleh).
- `src/app/api/content/process/route.ts` — pakai helper baru, hapus cabang `x-vercel-cron`.
- `src/lib/content/cron-auth.test.ts` (baru) — regresi: spoof `x-vercel-cron` harus ditolak.
- `supabase/migrations/20260831000001_processor_cron_bearer.sql` (submodule) — unschedule job lama, jadwalkan ulang dengan header `Authorization: Bearer ' || vault.decrypted_secrets (name='asharu_cron_secret')`.
- `scripts/seed-cron-secret.mjs` (baru) — buat secret di Vault via `vault_create_secret`; pakai nilai `CRON_SECRET` dari env jika ada, else generate `randomBytes(32)`; print sekali untuk disalin ke Vercel.
- `.env.example` — update komentar CRON_SECRET.

## Di Luar Scope (P1/P2 lain, menunggu plan lanjutan)
- INSERT anon tanpa limit DB, `get_llm_key()` REVOKE, key plaintext fallback, KeyPool menghukum key untuk error konten, retry tanpa cap, race claim, soft-delete guard, dll.

## Tasks
- [x] Plan file dibuat
- [x] cron-auth.ts + tests (6 test, termasuk regresi spoof x-vercel-cron)
- [x] route.ts pakai helper baru
- [x] Migration submodule (cron Bearer dari Vault) — `20260831000001_processor_cron_bearer.sql`
- [x] scripts/seed-cron-secret.mjs + .env.example
- [x] Gate: lint ✓ typecheck ✓ test 172/172 ✓ build ✓
- [x] Commit (submodule `dab480e` + parent `5b6330c`, `ff0407c`)
- [x] Push submodule `f872aa1..dab480e` → parent `738fd93..ff0407c`
- [x] Entri memory + README update
- [ ] Verifikasi pasca-deploy: POST tanpa auth → 401 (lihat progress log)
- [ ] **Setup user:** seed Vault → set CRON_SECRET di Vercel → apply migration ke DB

## Urutan Deploy (penting — fail-closed)
1. Jalankan `node --env-file=.env.local scripts/seed-cron-secret.mjs` → catat secret.
2. Set `CRON_SECRET` (nilai sama) di Vercel Environment Variables (Production).
3. Apply migration baru ke DB asharu (Dashboard SQL editor / `supabase db push`).
4. Deploy route fix (push parent).

Bila route fix aktif sebelum langkah 2–3: endpoint menolak semua (401) — processing berhenti sementara (fail-closed, tidak ada burn token), lalu pulih otomatis setelah secret terpasang.

## Risks
- Cron lama (header `x-vercel-cron`) tetap terjadwal sampai migration baru di-apply — route fix akan menolaknya (401) sampai migration + secret terpasang.
- Vault `decrypted_secrets` tidak terekspos PostgREST → script tidak bisa me-list secret by name; rotasi = buat secret baru (cron mengambil `ORDER BY created_at DESC LIMIT 1`), entri lama dihapus manual via Dashboard → Vault.
- Nama schema: pg_cron/pg_net di Supabase live di schema `extensions`; migration 0008 memakai nama tak-terkualifikasi (`cron.schedule`) — konsisten dipertahankan.

## Progress Log
- 2026-08-31 09:00 — Plan dibuat setelah user menyetujui lanjutan post-audit ("ya lanjut").
- 2026-08-31 08:05 — Implementasi selesai & ter-push: cron-auth.ts (Bearer-only, timingSafeEqual, fail-closed), 6 test baru (172 total hijau), route bersih, migration submodule `20260831000001`, seed script, .env.example. Commit: submodule `dab480e`, parent `5b6330c` + `ff0407c`. Push: submodule `f872aa1..dab480e`, parent `738fd93..ff0407c`. Vercel deploy berjalan otomatis.
- 2026-08-31 08:05 — Status: MENUNGGU SETUP USER (seed Vault → Vercel CRON_SECRET → apply migration). Sampai itu, endpoint 401 untuk semua pemanggil termasuk cron lama (fail-closed, disengaja).

## Notes
- Vercel Cron (bila suatu saat dipakai lagi) otomatis mengirim `Authorization: Bearer <CRON_SECRET>` saat env `CRON_SECRET` diset — jadi helper Bearer-only tetap kompatibel.
- Audit source: `.memory/2026-08-30/214500-content-factory-audit.md`.
