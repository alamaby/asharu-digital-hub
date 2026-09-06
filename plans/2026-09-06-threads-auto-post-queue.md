# Auto-Post Konten Approved → Threads @asharu.id (Antrean Terjadwal)

Created: 2026-09-06 12:00:00

## Objective

Konten yang sudah direview dan di-approve otomatis masuk antrean terjadwal lalu diposting ke Threads via akun https://www.threads.com/@asharu.id (full thread teks opener + replies, bahasa pilih id/en saat approve). Semua knob posting configurable by table (tiruan pola `llm_stage_defaults`), token di Supabase Vault, scheduler via pg_cron.

Keputusan user: trigger = antrean terjadwal; bahasa = pilih saat approve; cakupan = teks opener + replies; Meta App + token = belum ada.

## Scope

- Skema `social_*`: accounts, post_configs, post_queue, post_logs (+ RLS admin, seed threads/@asharu.id disabled-default).
- Server action approve+enqueue (ganti client-direct update) dengan toggle bahasa.
- Worker `/api/social/post` (Bearer cron): klaim queue → container → publish → reply chain → logs.
- OAuth callback `/api/social/oauth/callback` (admin-only) + script `seed-threads-token.mjs`.
- Admin UI `/admin/sosial`: kill-switch, window jadwal, cap, akun, monitor queue + retry/cancel.
- Env statis saja: `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_REDIRECT_URI` (Zod optional + `.env.example` placeholder).
- TAHAP AWAL: TEXT only. Image/video/carousel ditunda (butuh hosting publik + `image_url`).

## Milestones

1. Fase 0 — Meta App + token (USER ACTION, paralel, detail di bawah)
2. Fase 1 — Skema + lib + worker + OAuth + seed script + tests
3. Fase 2 — UI admin/sosial + approve+enqueue + badge queue di review
4. Fase 3 — Hardening: quota pre-check, resume chain, alert token, pg_cron poster+refresh

## Tasks

- [x] Riset alur approve + Threads API + pola config-by-table
- [ ] Fase 0: Meta App + OAuth + seed Vault (user, panduan di Notes)
- [ ] Migrasi `20260907000001_social_auto_post.sql` (4 tabel + RLS + seed)
- [ ] `src/lib/social/{config,threads,queue}.ts` + unit tests
- [ ] Env Zod + `.env.example` (THREADS_APP_ID/SECRET/REDIRECT_URI)
- [ ] `scripts/seed-threads-token.mjs`
- [ ] Route `/api/social/post` (cron worker) + `/api/social/oauth/callback`
- [ ] Server actions `approveDraftAndQueue`, `updateSocialConfig`, `retry/cancelQueue`
- [ ] Halaman `/admin/sosial` + badge queue di review
- [ ] pg_cron `asharu-social-poster */5` + `asharu-social-refresh daily` (migrasi)
- [ ] Gate hijau + commit/push (submodule dulu bila migrasi)

## Risks

- Thread terpotong bila reply tengah gagal → log per-`post_index` + resume dari index terakhir sukses.
- Token long-lived 60 hari + grant 90 hari (profil privat tak auto-extend) → cron refresh H-7 + alert H-2; profil publik disarankan.
- >5 link/post gagal (`THREADS_API__LINK_LIMIT_EXCEEDED`) → reply afiliasi dijaga, URL pertama jadi preview card.
- Approve client-direct tanpa audit → wajib lewat server action agar queue idempoten (`idempotency_key` per draft+platform).
- Jangan simpan token di env/kolom (redeploy tiap refresh + riwayat bocor) → Vault by-name.

## Progress Log

- 2026-09-06 12:00:00 — Plan dibuat (keputusan: queue terjadwal, lang override, full-text chain, Meta App belum ada).
- 2026-09-06 12:00:00 — Mulai Fase 1: migrasi + lib + worker.
- 2026-09-06 10:58:00 — Fase 1 selesai + push (submodule `464797b`, parent `8d9d638`); 283 tests hijau. Callback OAuth dipoles (redirect ikut origin).
- 2026-09-06 11:05:00 — Fase 0 lanjut: `THREADS_APP_ID` + `THREADS_APP_SECRET` terverifikasi terisi di `.env.local` (nilai tak pernah di-print); authorize URL dibuat untuk redirect prod `https://asharu.id/api/social/oauth/callback`. Blocker: migrasi belum applied di prod + secret belum di Vercel env.
- 2026-09-06 11:20:00 — Prasyarat selesai (user). Step 6 block: OAuth `1349245 has not accepted the invite` — di Threads sudah accept tapi belum masuk Active website permissions. Riset: bug Meta yang luas (Invite tab kadang hanya tombol Remove, status Roles Pending, backend tak sync). Troubleshooting diserahkan ke user.

## Notes

### Fase 0 detail (USER ACTION — paralel dengan Fase 1)

1. **Buat Meta App**: https://developers.facebook.com/apps → Create App → pilih Threads use case. Catat **Threads App ID + Threads App Secret** (bukan Meta App ID!) di `App settings > Basic`.
2. **Redirect URI**: set Valid OAuth Redirect URI = `https://asharu.id/api/social/oauth/callback` (match persis, waspada trailing slash). Tambahkan juga `http://localhost:3000/api/social/oauth/callback` untuk dev.
3. **Invite tester**: Roles → Threads Testers → invite akun `@asharu.id`. Tanpa ini OAuth gagal sebelum App Review.
4. **Profil publik**: set profil Threads @asharu.id = publik agar grant 90-hari bisa auto-extend via refresh.
5. **Set env** (Vercel Production + `.env.local`, JANGAN commit): `THREADS_APP_ID=<id>`, `THREADS_APP_SECRET=<secret>`, `THREADS_REDIRECT_URI=https://asharu.id/api/social/oauth/callback`.
6. **OAuth grant**: buka (ganti APP_ID/REDIRECT/STATE):
   `https://threads.com/oauth/authorize?client_id={APP_ID}&redirect_uri={REDIRECT}&scope=threads_basic,threads_content_publish,threads_manage_replies&response_type=code&state={random}`
   → Allow sebagai @asharu.id → callback terima `?code=...`.
7. **Tukar token** (server-side, secret tidak boleh ke client):
   `POST https://graph.threads.com/oauth/access_token` body `client_id, client_secret, code, grant_type=authorization_code, redirect_uri` → short-lived (1 jam) + `user_id`.
   Lalu `GET https://graph.threads.com/access_token?grant_type=th_exchange_token&client_secret={SECRET}&access_token={short}` → long-lived (60 hari). Catat `threads_user_id` via `GET /me?fields=id,username`.
8. **Seed ke Vault**: `node --env-file=.env.local scripts/seed-threads-token.mjs` (prompt: long-lived token + threads_user_id + expires_at) → Vault `threads_access_token_asharu_id`. Rotasi = re-run (RPC ambil newest). Verifikasi: token TIDAK pernah di-echo; hanya suffix 4 char di log.
9. **Aktifkan**: setelah token di Vault, set `social_post_configs.is_enabled=true` + `social_accounts.is_active=true` via `/admin/sosial`.

### Referensi API

- `POST /{user-id}/threads {media_type:TEXT, text[, reply_to_id]}` → `{id: creation_id}`; `POST /{user-id}/threads_publish {creation_id}` → `{id: threads_media_id}`.
- Quota: `GET /{id}/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage`; limit 250 post/24 jam, replies 1.000/24 jam, teks 500 char.
- Refresh: `GET /refresh_access_token?grant_type=th_refresh_token&access_token={long}` (syarat umur ≥24 jam).
- Docs: `developers.facebook.com/docs/threads/` (cek Apr–Jul 2026).
