# Threads Auto-Post Queue (Fase 0 plan + Fase 1 implementasi)

## Task
Konten approved otomatis masuk antrean terjadwal lalu diposting ke Threads @asharu.id
(full thread teks opener + replies, bahasa pilih id/en saat approve).
Semua config posting configurable by table.

## Key files changed
- `supabase/migrations/20260907000001_social_auto_post.sql` — tabel
  `social_accounts`, `social_post_configs`, `social_post_queue`, `social_post_logs`
  + RLS admin + seed threads/@asharu.id (disabled-default).
- `supabase/migrations/20260907000002_social_poster_cron.sql` — pg_cron
  `asharu-social-poster */5` → `/api/social/post` (Bearer-from-Vault).
- `src/lib/social/config.ts` — resolver akun, `nextSlot`, `extractThreadTexts`,
  `effectiveLang`, `buildIdempotencyKey` (+ `config.test.ts`, 6 tests).
- `src/lib/social/threads.ts` — client Threads API TEXT-only
  (container → publish, reply chain + resume, quota, OAuth exchange/refresh)
  (+ `threads.test.ts`, 2 tests).
- `src/lib/social/actions.ts` — `approveDraftAndQueue` (ganti client-direct update),
  `updateSocialConfig`, `toggleSocialAccount`, `retry/cancelSocialQueue`.
- `src/app/api/social/post/route.ts` — worker cron (klaim 1 queue/tick, daily cap,
  quota pre-check, resume chain, retry 429/5xx, opportunistic refresh H-7).
- `src/app/api/social/oauth/callback/route.ts` — Fase 0 callback admin-only
  (code → short → long-lived → Vault + update social_accounts).
- `src/app/[locale]/admin/sosial/page.tsx` — kill-switch, window, cap, akun, monitor queue.
- `src/lib/env.ts` + `.env.example` + `src/lib/env.test.ts` —
  `THREADS_APP_ID/SECRET/REDIRECT_URI` optional.
- `scripts/seed-threads-token.mjs` — seed long-lived token ke Vault (interaktif, tak echo).
- `plans/2026-09-06-threads-auto-post-queue.md` — plan + Fase 0 detail 9 langkah.

## Decisions
- Trigger = antrean terjadwal (bukan langsung saat approve); bahasa = override saat approve.
- TEXT-only tahap awal; image/video/carousel ditunda (butuh hosting publik).
- Token hanya di Vault by-name (`threads_access_token_asharu_id`); env hanya App ID/Secret statis.
- Worker aman by-default: no-op selama `social_post_configs.is_enabled=false`.

## Assumptions / risks
- Meta App + token BELUM ada → Fase 0 adalah USER ACTION (9 langkah di plan).
- Thread terpotong → resume dari `post_index` terakhir (logs per post).
- Token 60-hari auto-refresh oportunistik H-7 di worker; profil publik disarankan (grant 90-hari).
- Migrasi submodule di-commit+push, BELUM di-apply ke DB production
  (perlu `supabase db push` / apply via MCP oleh user).

## Verification
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 283 passed (37 files, +8 baru) ✓.
- Secret scan diff: bersih (satu hit `tvly-` hanya komentar placeholder).

## Commit
- Submodule `464797b feat(social): threads auto-post queue schema plus poster cron` (pushed).
- Parent `8d9d638 feat(social): threads auto-post queue worker plus admin UI` (pushed).

## Related
- `plans/2026-09-06-threads-auto-post-queue.md`
