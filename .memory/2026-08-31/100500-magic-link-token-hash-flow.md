# Magic-Link token_hash Flow (31 Agu)

Recorded: 2026-08-31 10:05

## Task / Problem
Magic-link login sebelumnya rapuh: `{{ .ConfirmationURL }}` (template) → GoTrue `/auth/v1/redirect` → app menerima `?code=<pkce>`, yang butuh cookie `code_verifier`. Cookie itu tidak reliable cross-domain/atribut → pertukaran gagal ("PKCE code verifier not found"); exchange page client-side fallback (`exchangeCodeForSession`) dibuat sesi sebelumnya untuk mitigasi. Sesi sebelumnya juga mulai menambah cabang `token_hash` di exchange page (Flow 1) TAPI template tidak di-update → cabang itu dead code. Tugas sesi ini: melengkapi flow (template) + commit + push.

## Key Files Changed
- `supabase/templates/magic_link.html` — `<a href>` dari `{{ .ConfirmationURL }}` → `{{ .SiteURL }}/id/auth/exchange?token_hash={{ .TokenHash }}&type={{ .Type }}` (+ komentar HTML penjelas pilihan direct-flow vs ConfirmationURL).
- `src/app/[locale]/auth/exchange/page.tsx` — (sesi sebelumnya, kini di-commit) Flow 1: `token_hash` + `type` → `verifyOtp` (no PKCE cookie); Flow 2: `?code=` → `exchangeCodeForSession` (legacy); error/session fallbacks; `parseVerifyType` whitelist.
- `src/components/auth/LoginForm.tsx` — komentar di-update: token_hash kini primary (template embed), `emailRedirectTo` tetap dipass untuk fallback Flow 2 + tetap perlu di Dashboard allow-list.

## Decisions
1. **Direct `token_hash` link** (bukan `.ConfirmationURL`) — `verifyOtp({ token_hash, type })` tidak butuh PKCE cookie → menghilangkan root-cause fragilitas. Ini pendekatan rekomendasi Supabase modern untuk magic link.
2. ~~Pakai `{{ .SiteURL }}` (bukan `.RedirectTo`) untuk base URL~~ → **DIKOREKSI 31 Agu ~10:50**: `.SiteURL` resolve ke **Dashboard "Site URL" setting** yang default-nya `http://localhost:3000` (config.toml = local-only, tidak sinkron ke produksi). Email produksi membawa URL localhost → klik gagal. Base URL kini `{{ .RedirectTo }}` (app dikontrol, ter-validasi allow-list, auto-adapt dev/prod via `env.siteUrl`). Lihat "Post-launch fix" di bawah.
3. `next` param TIDAK dipass via template — exchange page default `/id/konten/review` (admin-only login, `enable_signup=false`). `emailRedirectTo` dari LoginForm = `${base}/id/auth/exchange` (exchange page sendiri) → tidak berguna sebagai `next`; biarkan default.
4. Flow 2 (`?code=` PKCE) dipertahankan sebagai legacy fallback — exchange page mendukung keduanya. Tidak ada regresi untuk link lama/edge case.
5. Komentar LoginForm di-update ringkas (bukan hapus) — penjelasan allow-list + "PKCE code verifier not found" tetap valid untuk Flow 2.

## Assumptions / Risks
- `{{ .Type }}` untuk magic link = `magiclink` → `parseVerifyType` menerima. ✓
- Token hash URL-safe (tidak butuh encode di template).
- **Risiko utama (PRODUCTION):** `config.toml` + `magic_link.html` = template **local supabase CLI only**. Produksi hosted Supabase baca template dari **Dashboard → Auth → Email Templates → Magic Link**. Jadi deploy Vercel (exchange page code) sudah live, TAPI email produksi TIDAK akan emit `token_hash` sampai user manual paste template body sama ke Dashboard. Sebelum itu, produksi masih pakai ConfirmationURL → Flow 2 (fallback, rapuh). Lihat Blockers.
- Tidak ada regresi: Flow 2 tetap berfungsi; jika Dashboard template belum diupdate, login produksi jalan seperti sebelumnya (fragil tapi tidak lebih buruk).

## Blockers / Unresolved
- ~~**[USER STEP] Update production Dashboard email template**~~ → DONE 31 Agu ~10:10 (user konfirmasi).
- **[USER STEP] Re-paste template ke Dashboard** (31 Agu ~10:50): template berubah (`{{ .SiteURL }}/id/auth/exchange?...` → `{{ .RedirectTo }}?...`). User paste body `supabase/templates/magic_link.html` baru ke **Supabase Dashboard → Auth → Email Templates → Magic Link**. Sebelum re-paste, produksi masih pakai template `.SiteURL` lama → link masih localhost.
- **[USER STEP HYGIENE, opsional] Set Dashboard Site URL** = `https://asharu.id` (Dashboard → Auth → URL Configuration → Site URL; default-nya `http://localhost:3000`). Tidak lagi memblokir Flow 1 (karena base kini `.RedirectTo`), TAPI Flow 2 legacy `{{ .ConfirmationURL }}` (bila suatu saat dipakai) masih ikut Site URL. Higiene umum.
- **Root cause 504 sebelumnya** = port SMTP salah di Supabase config (bukan kode kita) — user sudah fix; email kirim normal.
- (Tetap) Setup P0 cron (`asharu_cron_secret` Vault + Vercel `CRON_SECRET` + apply `20260831000001`) — gate factory resume, independen dari magic-link.

## Verification
- Gate hijau: `npm run lint` ✓; `tsc --noEmit` ✓; `vitest run` 173/173 ✓; `next build` ✓ (exchange route `/[locale]/auth/exchange` kompilasi, 2.28 kB).
- Tidak ada test baru (flow auth sulit di-unit-test tanpa mock Supabase auth server; verifikasi end-to-end via manual magic-link request setelah Dashboard update).
- `config.toml` `site_url` = `https://asharu.id` ✓; `/id/auth/exchange` di `additional_redirect_urls` ✓.

## Commit Proposal
- (submodule, sudah push) `fix(auth): magic-link email embeds token_hash for verifyOtp flow` — `721e6a1`
- (parent, sudah push) `fix(auth): exchange page supports token_hash verifyOtp flow` — `2df08a6`
- (docs, sudah push) `docs: record magic-link token_hash flow` — `77f0901`
- (submodule, sudah push) `fix(auth): magic-link href uses RedirectTo to avoid localhost site url default` — `2a8215d`
- (parent, sudah push) `fix(auth): clarify redirect_to is critical for magic-link base url` — `0cab152`

## Post-launch fix (31 Agu ~10:50)
**Bug:** email produksi membawa URL `http://localhost:3000/id/auth/exchange?token_hash=...&type=magiclink` (bukan `https://asharu.id`). Root cause: template `{{ .SiteURL }}` resolve ke **Dashboard "Site URL" setting** (default `http://localhost:3000`); `config.toml` (`site_url = "https://asharu.id"`) = local CLI only, tidak sinkron ke produksi hosted. 504 awal = port SMTP salah di config Supabase (user sudah fix).
**Fix:** template base URL `{{ .SiteURL }}/id/auth/exchange?...` → `{{ .RedirectTo }}?...`. `.RedirectTo` = `redirect_to` yang dipass app (`emailRedirectTo = ${env.siteUrl}/id/auth/exchange` = `https://asharu.id/id/auth/exchange` di prod, `http://localhost:3000/id/auth/exchange` di dev) → environment-aware + tidak bergantung Dashboard Site URL. LoginForm comment di-update: redirect_to kini KRITIKAL (base URL link email), bukan sekadar fallback Flow 2. Push: submodule `721e6a1..2a8215d`, parent `2df5762..0cab152`. **[USER STEP]** re-paste template ke Dashboard.

## Related Plans
- `plans/2026-08-31-content-factory-audit-fixes.md` (catatan "Di luar batch ini" → magic-link dikerjakan terpisah di sini).
- `.memory/2026-08-31/080400-p0-processor-cron-auth-fix.md` (P0 gate factory; independen).
