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
- [x] Verifikasi pasca-deploy: POST tanpa auth → 401 ✓, POST spoof `x-vercel-cron: 1` → 401 ✓ (fix live), GET `/` → 307 ✓
- [ ] **Setup user:** seed Vault → set CRON_SECRET di Vercel → apply migration ke DB

## Fase 2 — P1 Fixes (batch kedua, sama-sama dari audit 30 Agu)

### Scope
1. `get_llm_key()` REVOKE dari PUBLIC/anon/authenticated, GRANT service_role (migration).
2. Migrasi data: key plaintext di `api_key_encrypted` → Vault, lalu kolom di-NULL-kan (kolom tidak di-drop dulu — non-destruktif).
3. KeyPool hanya menghukum key untuk error kredensial/limit (`LLMHttpError` 401/403/429) — error konten (JSON/shape/max_chars) dan 5xx tidak lagi menonaktifkan key.
4. Retry cap: `content_requests.attempts` + status `failed` (cap 3 di processor); reset kondisional `.eq('status','processing')` (sekalian menutup P2 race claim).
5. Bonus keamanan kecil: Gemini API key pindah dari query string ke header `x-goog-api-key`.

### Tasks Fase 2
- [x] Migration `20260831000002_lock_get_llm_key.sql` (+ commit foundational `20260829000002_add_api_key_fallback.sql` — prasyarat, sebelumnya untracked)
- [x] Migration `20260831000003_migrate_plaintext_keys_to_vault.sql` (no-op di live — semua key sudah di Vault; kolom dibiarkan NULL, tidak di-drop)
- [x] Migration `20260831000004_request_attempts_failed.sql`
- [x] `LLMHttpError` di types.ts + 3 provider throw dengan status
- [x] key-pool.ts: markKeyFailure kondisional (401/403/429 saja; 5xx & error konten tidak blame) + tests update (5 test, klasifikasi)
- [x] route.ts: attempts cap (MAX_ATTEMPTS=3 → 'failed') + reset kondisional `.eq('status','processing')` + flag `claimedByUs` (tutup P2 race claim juga)
- [x] Bonus: Gemini key query string → header `x-goog-api-key`
- [x] Gate: lint ✓ typecheck ✓ test 173/173 ✓ build ✓
- [x] DB live asharu (via MCP): 3 migration applied + verified — `get_llm_key` kini hanya postgres+service_role; `attempts` int default 0; status check termasuk `failed`
- [x] Commit lokal: submodule `7fb73d8`+`7bf4f30`, parent `5b7e5d9`
- [ ] **Push** (menunggu instruksi eksplisit user — memory decision #7)
- [x] Docs (plan + memory)

### Di luar batch ini (butuh keputusan desain)
- **INSERT anon tanpa limit DB** — opsi: (a) wajib login, (b) captcha/Turnstile, (c) terima risiko (rate limit app-level tetap). Keputusan produk → user.
- P2 lain: soft-delete guard scraper, ContentDraftCard error surfacing, konsolidasi email admin.

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
- 2026-08-31 08:10 — Verifikasi deploy: POST tanpa auth → 401 ✓; POST spoof `x-vercel-cron: 1` → 401 ✓ (P0 tertutup, fix live); GET `/` → 307 ✓. Cron lama kini memang 401 → processing factory berhenti sampai setup user selesai (diharapkan).
- 2026-08-31 08:15 — Fase 2 (P1) dimulai: lock get_llm_key, migrasi plaintext key → Vault, KeyPool error classification, retry cap. Detail scope di atas.
- 2026-08-31 ~09:40 — Fase 2 (P1) SELESAI (kerja lanjutan dari sesi sebelumnya yang belum di-commit). Implementasi: LLMHttpError (types.ts) + 3 provider throw status; key-pool markKeyFailure kondisional (401/403/429 saja — 5xx & error konten tidak blame, sesuai plan yang menyempurnakan audit); route.ts attempts cap MAX_ATTEMPTS=3 → 'failed' + reset kondisional `.eq('status','processing')` + flag `claimedByUs` (menutup P2 race claim juga); Gemini key → header `x-goog-api-key`. Migrations 0002_lock/0003_migrate/0004_attempts + foundational 0002_add (sebelumnya untracked, prasyarat). Gate hijau: lint ✓ typecheck ✓ test 173/173 ✓ build ✓.
- 2026-08-31 ~09:40 — DB live asharu (via MCP `supabase-asharu-be-production`, blocker lama "MCP tersambung ke albot-be" kini teratasi): 3 migration di-apply + verified — `get_llm_key` kini hanya postgres+service_role (oracle PUBLIC/anon/authenticated tertutup); `content_requests.attempts` int default 0; status check termasuk `failed`. Ditemukan: semua 4 key sudah di Vault (0 plaintext) → 0003 no-op di live. Ditemukan 3 baris `content_requests` status='processing' NYANGKUT (korban fail-closed P0 — di-claim tapi tidak terselesaikan karena endpoint 401) — TIDAK di-reset otomatis (mutasi data prod menunggu keputusan user); saat factory resume mereka tidak akan di-pick-up (claim hanya `status='pending''). Opsi: reset ke `pending` (attempts=0) untuk reprocess, atau `failed`.
- 2026-08-31 ~09:40 — Commit lokal (belum push, memory decision #7): submodule `7fb73d8` (foundational 0002_add) + `7bf4f30` (Fase 2 migrations); parent `5b7e5d9`. Sisa uncommitted sengaja: `src/app/[locale]/auth/exchange/page.tsx` + `supabase/templates/magic_link.html` (magic-link `token_hash` flow — KONSEP TERPISAH & kemungkinan belum selesai: template masih pakai `{{ .ConfirmationURL }}` tak kirim `token_hash` → cabang `token_hash` di exchange page dead code; butuh plan/keputusan terpisah, tidak ikut commit Fase 2).

## Notes
- Vercel Cron (bila suatu saat dipakai lagi) otomatis mengirim `Authorization: Bearer <CRON_SECRET>` saat env `CRON_SECRET` diset — jadi helper Bearer-only tetap kompatibel.
- Audit source: `.memory/2026-08-30/214500-content-factory-audit.md`.
