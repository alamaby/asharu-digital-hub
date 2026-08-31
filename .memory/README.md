# Asharu Digital Hub — Project Memory Index

Format version: 1
Last updated: 2026-08-31 10:10 (local time)

## Current State

- **Status:** Content Factory (form → Supabase → processor pg_cron → multi-provider LLM → review admin) selesai Fase 1–3 dan sudah deploy; domain produksi `https://asharu.id` live. **P0 audit (cron auth spoofable) sudah diperbaiki** (31 Agu), **Fase 2 P1 sudah dikerjakan + di-apply ke DB live + di-push** (31 Agu ~09:40), dan **magic-link `token_hash` flow sudah lengkap** (31 Agu ~10:05): kode + template local di-push; **template produksi Dashboard sudah diset user** (31 Agu ~10:10) → flow `verifyOtp` aktif di produksi. 3 baris `content_requests` nyangkut → `failed` (user decision). Factory MASIH berhenti (fail-closed) menunggu setup P0 user (seed Vault `asharu_cron_secret` + Vercel `CRON_SECRET` + apply `20260831000001`). Sisa P1 (INSERT anon limit) + P2/P3 belum.
- **Stack:** Next.js 15 App Router + React 19 + TS strict + Tailwind 3.4 + next-intl v4 + Zod + Supabase (auth Magic Link, Postgres+RLS, Vault, pg_cron+pg_net). Situs publik tetap statis/SSG; content factory = dinamis.
- **Halaman publik:** `/id` & `/en` (home + carousel afiliasi 6 produk), produk (~201 dari scraper), properti (+detail), tentang, privasi, disclosure, not-found. Root `/` → 307 `/id`.
- **Content factory:** `/konten/baru` (form, anon, rate limit 5/jam/IP + honeypot), `/konten/review` (admin, copy per-post, approve/reject), `/masuk` (magic link `token_hash` flow — template embed `{{ .TokenHash }}`), `/api/content/process` (processor, maxDuration 60). Provider: naraya(10) → openrouter(20) → gemini(30) → cloudflare(40); key di Vault (semua 4 key sudah di Vault, 0 plaintext).
- **Analytics:** GA4 consent-gated opt-in; event kustom + `page_view` + `view_property`.
- **Keamanan:** CSP ketat (`unsafe-inline` script trade-off terdokumentasi, `unsafe-eval` dev-only), HSTS, frame-ancestors none; env divalidasi Zod fail-fast.

## Active Decisions

1. i18n: next-intl localized pathnames (`/id/produk` ↔ `/en/products`), `localeDetection:false` → root deterministik ke `/id`.
2. Consent model GA: **opt-in**; UI consent tidak dirender bila GA tidak dikonfigurasi.
3. Halaman detail properti `[slug]` dipertahankan di luar spek minimal.
4. Placeholder gambar = SVG buatan sendiri (`unoptimized` untuk .svg).
5. Tanpa harga fiktif: produk "Cek harga terbaru", properti "Hubungi untuk harga".
6. JSON-LD: Organization; tanpa Product/offers sampai harga terverifikasi.
7. Tidak ada commit/push ke remote tanpa instruksi eksplisit user.
8. Supabase secret key `sb_secret_...` menggantikan `service_role` JWT (deprecated 2025-12); env: `SUPABASE_SECRET_KEY` (prefer) + alias; guard: `.memory/ENV_GUARD.md`; real key hanya di `.env.local` (gitignore) + Vercel env.
9. Content factory: tepat 1 produk afiliasi per thread (CHECK DB), placeholder `{{PRODUCT_URL}}` diganti pasca-validasi; bilingual single-JSON call.
10. Provider LLM DB-driven via `llm_providers.priority`; key pool round-robin + circuit breaker (`failure_count > 5` → nonaktif permanen, tanpa auto-recovery).
11. Key LLM di Supabase Vault via RPC wrapper `public.vault_*` (SECURITY DEFINER, service_role only); seed via `scripts/seed-llm-keys.mjs`.
12. Cron processor berjalan di Supabase pg_cron tiap 5 menit (Vercel Hobby limit) → POST `https://asharu.id/api/content/process`; `vercel.json` crons kosong.
13. Dual-write scraper (file `src/data/affiliate-products.ts` + DB `affiliate_products`); DB sumber ASH-XXX, file sumber build statis.
14. Admin = 2 email (`alam.aby.b@gmail.com`, `alamaby@gmail.com`) — saat ini ter-hardcode di 4 tempat (middleware, review page, `is_admin()`, `handle_new_user`); konsolidasi ke `profiles.is_admin` tertunda.

## Open Items / Blockers

- [ ] **Setup pasca-fix P0 (urutan wajib):** (1) jalankan `node --env-file=.env.local scripts/seed-cron-secret.mjs`, (2) set `CRON_SECRET` (nilai sama) di Vercel Production, (3) apply migration `20260831000001_processor_cron_bearer.sql` ke DB asharu. Sebelum lengkap, endpoint 401 untuk semua (fail-closed — processing berhenti sementara).
- [x] **P1 (audit) — Fase 2 selesai 31 Agu ~09:40:** `get_llm_key` REVOKE dari PUBLIC/anon/authenticated ✓; key plaintext → Vault (semua sudah di Vault, no-op) ✓; KeyPool hanya blame 401/403/429 (5xx & error konten tidak) ✓; retry cap 3 → `failed` + `attempts` column ✓; P2 race claim ditutup (`claimedByUs` + `.eq('status','processing')`) ✓. Commit lokal `5b7e5d9` + submodule `7fb73d8`/`7bf4f30`; DB applied+verified via MCP asharu. **Belum push** (memory #7).
- [ ] **Sisa P1 (butuh keputusan desain user):** INSERT anon tanpa limit DB (opsi: wajib login / Turnstile / terima risiko rate limit app-level).
- [ ] **3 baris `content_requests` status='processing' nyangkut** — korban fail-closed P0 (di-claim lalu endpoint 401). Saat factory resume, claim hanya pick `pending` → 3 baris tidak diproses. Tidak di-auto-reset (mutasi data prod). Opsi user: reset `pending` (attempts=0) untuk reprocess, atau `failed`.
- [ ] **P2/P3 audit lain belum:** soft-delete guard scraper, ContentDraftCard error surfacing, konsolidasi email admin → `profiles.is_admin`, duplikasi `getServiceClient`, `rate_limits` cleanup, realtime review (`supabase.channel`), middleware matcher persempit, `target_category` validasi saat submit, dll.
- [x] **Magic-link `token_hash` flow:** kode + template (local) sudah di-push (`2df08a6` parent, `721e6a1` submodule). Template produksi (**Supabase Dashboard → Auth → Email Templates → Magic Link**) sudah diset user (31 Agu ~10:10) dengan body `supabase/templates/magic_link.html` (link `{{ .SiteURL }}/id/auth/exchange?token_hash={{ .TokenHash }}&type={{ .Type }}`). Verifikasi direkomendasikan: request magic link ke admin email → link harus berisi `token_hash=` (bukan `/auth/v1/redirect`), lalu klik → login sukses tanpa error "PKCE code verifier not found".
- [ ] Verifikasi env produksi: `CRON_SECRET` & `NEXT_PUBLIC_*` sudah diset di Vercel? (domain sudah live — indikasi ya, tapi konfirmasi manual).
- [x] Verifikasi DB live via MCP asharu (blocker lama "tersambung albot-be" teratasi 31 Agu): key storage = semua 4 di Vault (0 plaintext) ✓; distribusi `content_requests` = {needs_review:1, processing:3 nyangkut} ✓; `get_llm_key` grants ✓ (kini service_role saja). Sisa: cek error `llm_call_logs` terakhir.
- [ ] Data placeholder (`src/data/*`, `public/images/*`) HARUS diganti data terverifikasi sebelum launch publik penuh; Tokopedia/TikTok Shop masih `hidden: true`.
- [ ] Realtime review (`supabase.channel`) direncanakan tapi belum diimplementasi.
- [ ] QA manual: Lighthouse ≥90/95/95/95, screen reader/keyboard di perangkat nyata.
- [ ] Transisi dual-write → DB-only (rencana fase lanjut).

## Recent Entries

- [2026-08-31 100500-magic-link-token-hash-flow.md](2026-08-31/100500-magic-link-token-hash-flow.md) — magic-link `token_hash` flow: template embed TokenHash → exchange `verifyOtp` (no PKCE cookie); pushed; [USER STEP] Dashboard prod template.
- [2026-08-31 094000-fase2-p1-llm-key-retry-hardening.md](2026-08-31/094000-fase2-p1-llm-key-retry-hardening.md) — Fase 2 P1: lock get_llm_key, key pool classification (401/403/429 only), retry cap 3→failed + attempts, Gemini key→header; DB applied+verified via MCP asharu; pushed.
- [2026-08-31 080400-p0-processor-cron-auth-fix.md](2026-08-31/080400-p0-processor-cron-auth-fix.md) — fix P0: endpoint Bearer-only + pg_cron baca secret dari Vault.
- [2026-08-30 214500-content-factory-audit.md](2026-08-30/214500-content-factory-audit.md) — audit keamanan/konsistensi: 2 P0, 5 P1, 5 P2, 7 P3.
- [2026-08-30 214400-content-factory-hardening.md](2026-08-30/214400-content-factory-hardening.md) — vault RPC, cloudflare, model ids, magic-link exchange, pg_cron (29–30 Agu).
- [2026-08-30 214300-content-factory-implementation.md](2026-08-30/214300-content-factory-implementation.md) — content factory fase 1–3 end-to-end (28–29 Agu).
- [2026-08-30 214200-affiliate-carousel-scraper.md](2026-08-30/214200-affiliate-carousel-scraper.md) — carousel home + scraper Linktree + 201 produk (27 Agu).
- [2026-08-26 123000-math-section.md](2026-08-26/123000-math-section.md) — section Belajar Matematika linking to math.asharu.id.
- [2026-08-26 090500-lighthouse-perf-seo-fixes.md](2026-08-26/090500-lighthouse-perf-seo-fixes.md) — perf/SEO fixes dari audit LH.
- [2026-08-25 124500-property-review-fixes.md](2026-08-25/124500-property-review-fixes.md) — 7 temuan review properti + ads.txt.
- [2026-08-25 121000-property-migration.md](2026-08-25/121000-property-migration.md) — 3 listing riil migrated.
- [2026-08-25 111000-shopee-review-fixes.md](2026-08-25/111000-shopee-review-fixes.md) — identitas riil Shopee + accessible name.
- [2026-08-25 104500-shopee-store-integration.md](2026-08-25/104500-shopee-store-integration.md) — Shopee riil: kanonis + affiliate fallback.
- [2026-08-24 131000-asharu-code-review-fixes.md](2026-08-24/131000-asharu-code-review-fixes.md) — remediasi 9 temuan review.
- [2026-08-24 123500-asharu-digital-hub-full-implementation.md](2026-08-24/123500-asharu-digital-hub-full-implementation.md) — implementasi lengkap end-to-end.

## Legacy Archive

Tidak ada `PROJECT_MEMORY.md` (format `.memory/` langsung dipakai sejak awal).
