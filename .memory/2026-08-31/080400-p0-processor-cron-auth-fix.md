# P0 Fix — Processor Cron Auth (Bearer Secret) (31 Agu)

Recorded: 2026-08-31 08:04

## Task / Problem
Menutup temuan P0 audit 30 Agu: `/api/content/process` menerima header `x-vercel-cron` apa pun (spoofable, dan tidak ada lagi pemanggil sah yang memakainya setelah cron pindah ke pg_cron) → siapa pun bisa men-trigger processor dan membakar token LLM.

## Key Files Changed
- `src/lib/content/cron-auth.ts` (baru) — `isCronAuthorized(request, options?)`: Bearer-only dengan `timingSafeEqual`; fail-closed di produksi bila `CRON_SECRET` kosong; dev tanpa secret tetap boleh.
- `src/app/api/content/process/route.ts` — hapus cabang `x-vercel-cron` + fungsi lokal, pakai helper baru.
- `src/lib/content/cron-auth.test.ts` (baru) — 6 test, termasuk regresi spoof `x-vercel-cron` ditolak.
- `supabase/migrations/20260831000001_processor_cron_bearer.sql` (submodule) — unschedule job lama, jadwalkan ulang dengan `Authorization: Bearer ' || decrypted_secret` dari Vault (`asharu_cron_secret`, `ORDER BY created_at DESC`).
- `scripts/seed-cron-secret.mjs` (baru) — buat/rotasi secret di Vault; pakai nilai `CRON_SECRET` env bila ada (menjamin Vault == Vercel), else generate; print sekali untuk disalin ke Vercel.
- `.env.example` — komentar CRON_SECRET diperbarui.

## Technical / Business Decisions
- Bearer-only: Vercel Cron (jika kelak dipakai) otomatis mengirim `Authorization: Bearer <CRON_SECRET>` bila env diset — kompatibel tanpa header spoofable.
- Secret TIDAK ditaruh di file migration (masuk git); dibaca pg_cron dari Vault langsung (job berjalan sebagai postgres yang boleh membaca `vault.decrypted_secrets`).
- Fail-closed: salah konfigurasi = processing berhenti (401), bukan endpoint terbuka.

## Assumptions / Risks
- Sampai user menjalankan setup (seed Vault → set Vercel CRON_SECRET → apply migration), endpoint menolak SEMUA pemanggil termasuk cron lama → processing factory berhenti sementara (disengaja, aman).
- Rotasi menyisakan entri Vault lama (tidak bisa di-list via PostgREST) — hapus manual via Dashboard → Vault.
- P1/P2 audit lain (INSERT anon tanpa limit DB, `get_llm_key` REVOKE, key plaintext, KeyPool error konten, retry tanpa cap, race claim) BELUM diperbaiki — lihat plan.

## Blockers / Unresolved
- Aksi user (urutan di plan): `node --env-file=.env.local scripts/seed-cron-secret.mjs` → set `CRON_SECRET` di Vercel Production → apply migration `20260831000001` ke DB asharu (SQL editor / `supabase db push`).

## Verification
- Gate hijau: lint ✓ typecheck ✓ test 172/172 (6 test baru) ✓ build ✓.
- Push: submodule `f872aa1..dab480e`, parent `738fd93..ff0407c`.
- Pasca-deploy (31 Agu 08:10): POST tanpa auth → 401 ✓; POST spoof `x-vercel-cron: 1` → 401 ✓ (P0 tertutup, fix live); GET `/` → 307 ✓.

## Commit Proposal
(sudah ter-commit: `5b6330c`)

## Related Plans
- `plans/2026-08-31-content-factory-audit-fixes.md` (sumber; progress log di-update)
- `.memory/2026-08-30/214500-content-factory-audit.md` (temuan P0)
