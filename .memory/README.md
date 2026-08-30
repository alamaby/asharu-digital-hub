# Asharu Digital Hub — Project Memory Index

Format version: 1
Last updated: 2026-08-30 21:46 (local time)

## Current State

- **Status:** Content Factory (form → Supabase → processor pg_cron → multi-provider LLM → review admin) selesai Fase 1–3 dan sudah deploy; domain produksi `https://asharu.id` live (dicek 30 Agu). Audit keamanan/konsistensi 30 Agu menemukan 2 P0 (cron auth spoofable) + 5 P1 — menunggu keputusan fix (lihat entri audit).
- **Stack:** Next.js 15 App Router + React 19 + TS strict + Tailwind 3.4 + next-intl v4 + Zod + Supabase (auth Magic Link, Postgres+RLS, Vault, pg_cron+pg_net). Situs publik tetap statis/SSG; content factory = dinamis.
- **Halaman publik:** `/id` & `/en` (home + carousel afiliasi 6 produk), produk (~201 dari scraper), properti (+detail), tentang, privasi, disclosure, not-found. Root `/` → 307 `/id`.
- **Content factory:** `/konten/baru` (form, anon, rate limit 5/jam/IP + honeypot), `/konten/review` (admin, copy per-post, approve/reject), `/masuk` (magic link), `/api/content/process` (processor, maxDuration 60). Provider: naraya(10) → openrouter(20) → gemini(30) → cloudflare(40); key di Vault (fallback kolom plaintext — lihat audit).
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

- [ ] **P0 (audit 30 Agu):** `/api/content/process` menerima header `x-vercel-cron` spoofable; pg_cron belum kirim `Bearer CRON_SECRET`. Rantai abuse: insert anon langsung ke `content_requests` (tanpa limit DB) + trigger processor + retry tanpa batas. → butuh plan fix.
- [ ] **P1 (audit):** `get_llm_key()` belum di-REVOKE dari PUBLIC; key plaintext di `api_key_encrypted` (re-seed Vault + drop kolom); KeyPool menghukum key karena error konten; retry request tanpa cap.
- [ ] Verifikasi env produksi: `CRON_SECRET` & `NEXT_PUBLIC_*` sudah diset di Vercel? (domain sudah live — indikasi ya, tapi konfirmasi manual).
- [ ] Verifikasi DB live via Dashboard asharu (MCP session ini tersambung ke project lain `albot-be`): mode penyimpanan key (Vault vs plaintext), distribusi status `content_requests`, error `llm_call_logs`.
- [ ] Data placeholder (`src/data/*`, `public/images/*`) HARUS diganti data terverifikasi sebelum launch publik penuh; Tokopedia/TikTok Shop masih `hidden: true`.
- [ ] Realtime review (`supabase.channel`) direncanakan tapi belum diimplementasi.
- [ ] QA manual: Lighthouse ≥90/95/95/95, screen reader/keyboard di perangkat nyata.
- [ ] Transisi dual-write → DB-only (rencana fase lanjut) + rapikan duplikasi `getServiceClient` (3 file) & email admin (4 tempat).

## Recent Entries

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
