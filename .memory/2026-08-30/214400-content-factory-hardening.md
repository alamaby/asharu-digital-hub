# Content Factory Hardening — Vault, Provider, Auth, Cron (29–30 Agu)

Recorded: 2026-08-30 21:44 (entri retroaktif untuk kerja 2026-08-29 s.d. 08-30)

## Task / Problem
Rangkaian perbaikan pasca-deploy content factory: Vault tidak terbuka lewat PostgREST, provider Cloudflare gagal, magic link redirect ke localhost, dan cron Vercel kena limit hobby.

## Key Files Changed
- `supabase/migrations/20260829000001_enable_vault.sql` — aktifkan `supabase_vault`.
- `20260829000002_add_api_key_fallback.sql` — kolom `api_key_encrypted` + fungsi `get_llm_key()` (fallback plaintext saat Vault belum siap — lihat catatan risiko).
- `20260829000003_vault_rpc_wrappers.sql` + `0004_vault_delete_wrapper.sql` — RPC `vault_create_secret/decrypt/delete` (SECURITY DEFINER, REVOKE public, GRANT service_role).
- `20260829000005_provider_config.sql` — `llm_providers.config jsonb` (cloudflare `account_id`).
- `20260829000006_fix_cloudflare_base_url.sql` + `0007_fix_model_ids.sql` — base_url `/accounts/{id}/ai`, buang prefix `naraya/`, gemini-1.5-flash → gemini-2.5-flash.
- `20260829000008_processor_cron.sql` — pg_cron + pg_net, POST tiap 5 menit ke `https://asharu.id/api/content/process` (header `x-vercel-cron: 1` — lihat catatan risiko).
- `src/app/[locale]/auth/exchange/page.tsx` + `src/app/api/auth/callback/route.ts` — exchange PKCE magic link (server-side + fallback client-side; server cookie issue di Vercel).
- `src/lib/env.ts`, `.env.example` — migrasi `sb_secret_`/`sb_publishable_` + alias deprecated + env guard (`.memory/ENV_GUARD.md`).
- `next.config.ts` — CSP `unsafe-eval` dev-only + supabase connect-src; `vercel.json` — crons kosong (hobby limit), `maxDuration 60` untuk processor.
- `scripts/seed-llm-keys.mjs` — seed/migrasi key via RPC Vault (idempotent).

## Technical / Business Decisions
- Cron dipindah ke Supabase pg_cron (Vercel Hobby hanya 1 cron); processor tetap Route Handler di Vercel.
- Redirect magic link memakai `env.siteUrl` + redirect allow-list Supabase untuk memastikan domain produksi.
- Vault RPC dibungkus di schema `public` karena schema `vault` tidak terekspos PostgREST.

## Assumptions / Risks
- `get_llm_key()` (0002) belum di-REVOKE dari PUBLIC dan kolom `api_key_encrypted` menyimpan plaintext — terkonfirmasi sebagai temuan P1 audit (lihat `214500-content-factory-audit.md`).
- Cron pg_cron mengandalkan header `x-vercel-cron` yang spoofable — temuan P0 audit.

## Blockers / Unresolved
- Verifikasi apakah `CRON_SECRET` sudah diset di Vercel env produksi (tidak bisa dicek dari repo).
- State DB live (key di Vault vs plaintext, backlog request) perlu dicek via Dashboard asharu — MCP Supabase yang tersambung di session ini adalah project lain (`albot-be`).

## Verification
- Deploy produksi aktif: `https://asharu.id` live (dicek 30 Agu) — konten lengkap (produk, properti, math.asharu.id).
- Commit chain `b85da09` → `738fd93` (semua push ke `main`).

## Commit Proposal
(sudah ter-commit — tidak ada commit baru)

## Related Plans
- `plans/2026-08-28-content-factory-fase2-fixes.md`
- `.memory/ENV_GUARD.md`
