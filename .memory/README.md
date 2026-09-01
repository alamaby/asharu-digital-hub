# Asharu Digital Hub — Project Memory Index

Format version: 1
Last updated: 2026-09-02 12:10 (local time)

## Current State

- **Status:** Content Factory selesai Fase 1–3 + P0/P1 audit + magic-link token_hash + admin quick-wins (dashboard/list/nav, profiles.is_admin single source) + **content pipeline 4-tahap (2 Sep)**: form → `content_research_sessions` → cron `asharu-content-research` (*/10) advance Discovery→Verification→Scoring→`awaiting_selection` (admin shortlist)→Development→draft. Search real-time via **Tavily**. Affiliate = top-20 terbaru + scoring relevansi + card produk di review (badge, Ganti/Hapus). Domain `https://asharu.id` live. **P0 cron SELESAI (2 Sep):** Vault `asharu_cron_secret` di-seed + `CRON_SECRET` di Vercel + redeploy → cron riset (*/10) & legacy (*/5) aktif (Bearer-from-Vault). Migrasi `20260831000001` dinetralkan (superseded). **Tinggal seed Tavily ke Vault** (`scripts/seed-tavily-key.mjs`) agar Discovery jalan. Sisa P1 (INSERT anon limit) + P2/P3 + iterasi discovery (single-pass dulu) belum.
- **Stack:** Next.js 15 App Router + React 19 + TS strict + Tailwind 3.4 + next-intl v4 + Zod + Supabase (auth Magic Link, Postgres+RLS, Vault, pg_cron+pg_net). Situs publik tetap statis/SSG; content factory = dinamis.
- **Halaman publik:** `/id` & `/en` (home + carousel afiliasi 6 produk), produk (~201 dari scraper), properti (+detail), tentang, privasi, disclosure, not-found. Root `/` → 307 `/id`.
- **Halaman admin (1 Sep):** `/id/admin` (dashboard: queue, review count, research placeholder, recent drafts [link ke /konten/review], quick actions), `/id/admin/konten` (list filter+sort+paginate dengan useTransition spinner, i18n `admin` namespace included di client bundle), `/id/konten/baru` (form dengan success state inline: 2 link — "Lihat draf" & "Buat lagi"; back nav ke Dasbor), `/id/konten/review` (drafts). Nav admin items hanya muncul saat login+admin (server-side, no flicker). Error.tsx & loading.tsx di /admin & /konten/review.
- **Content factory:** `/konten/baru` (form + collapsible "Pengaturan Riset Lanjutan", anon, rate limit 5/jam/IP + honeypot → `createResearchSession`), `/admin/riset` (list sesi + status badge), `/admin/riset/[sessionId]` (topics + shortlist/reject/advance), `/admin/riset/[sessionId]/topics/[topicId]` (detail), `/konten/review` (admin, copy per-post, approve/reject, **AffiliateProductCard** badge relevansi + Ganti/Hapus), `/masuk` (magic link `token_hash`), `/api/content/process` (research orchestrator, maxDuration 300), `/api/content/process-legacy` (content_requests lama, maxDuration 60). Provider: naraya(10) → openrouter(20) → gemini(30) → cloudflare(40); key di Vault. Search: Tavily (key di **Vault** `tavily_api_key`, baca via `vault_decrypt_secret_by_name` RPC; env `TAVILY_API_KEY` fallback dev; seed via `scripts/seed-tavily-key.mjs`). Cron: `asharu-content-research` (*/10) + `asharu-content-legacy` (*/5), Bearer-from-Vault `asharu_cron_secret`.
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
11. Key LLM di Supabase Vault via RPC wrapper `public.vault_*` (SECURITY DEFINER, service_role only); seed via `scripts/seed-llm-keys.mjs`. Sama untuk Tavily: Vault `tavily_api_key` via RPC baru `vault_decrypt_secret_by_name` (by-name, bukan by-id); seed via `scripts/seed-tavily-key.mjs`.
12. Cron processor berjalan di Supabase pg_cron tiap 5 menit (Vercel Hobby limit) → POST `https://asharu.id/api/content/process`; `vercel.json` crons kosong.
13. Dual-write scraper (file `src/data/affiliate-products.ts` + DB `affiliate_products`); DB sumber ASH-XXX, file sumber build statis.
14. Admin membership = `profiles.is_admin` (single source of truth, 1 Sep 2026). `is_admin()` SQL baca profiles; `handle_new_user` default `is_admin=false`; middleware & review page lookup via profiles (tidak ada hardcoded email di kode). Admin baru di-elevate via `UPDATE profiles SET is_admin = true`. (P2 audit #12 ditutup.)

## Open Items / Blockers

- [x] **Setup P0 cron SELESAI (2 Sep):** (1) Vault `asharu_cron_secret` sudah di-seed (terverifikasi via MCP, created 2026-09-01 04:22 UTC), (2) `CRON_SECRET` diset di Vercel Production + redeploy (user). Cron `asharu-content-research` (*/10) + `asharu-content-legacy` (*/5) baca Vault → kirim Bearer → endpoint validasi. **Migrasi `20260831000001` dinetralkan** (jadi no-op; scheduling Bearer-from-Vault sudah dipegang `20260901000002`) — tidak perlu/tidak boleh di-apply ulang (hindari dobel job `process-content-requests`).
- [x] **P1 (audit) — Fase 2 selesai 31 Agu ~09:40:** `get_llm_key` REVOKE dari PUBLIC/anon/authenticated ✓; key plaintext → Vault (semua sudah di Vault, no-op) ✓; KeyPool hanya blame 401/403/429 (5xx & error konten tidak) ✓; retry cap 3 → `failed` + `attempts` column ✓; P2 race claim ditutup (`claimedByUs` + `.eq('status','processing')`) ✓. Commit lokal `5b7e5d9` + submodule `7fb73d8`/`7bf4f30`; DB applied+verified via MCP asharu. **Belum push** (memory #7).
- [ ] **Sisa P1 (butuh keputusan desain user):** INSERT anon tanpa limit DB (opsi: wajib login / Turnstile / terima risiko rate limit app-level).
- [x] **3 baris `content_requests` status='processing' nyangkut** → di-set `failed` (user decision 31 Agu, via MCP execute_sql; ids cf8b8b5c5, 2972da62, e30761c7).
- [ ] **Seed Tavily key ke Vault [USER ACTION]:** `node --env-file=.env.local scripts/seed-tavily-key.mjs` (atau `node scripts/seed-tavily-key.mjs` lalu paste key). Menyimpan sebagai Vault `tavily_api_key`; processor baca via RPC `vault_decrypt_secret_by_name` (service_role). Env `TAVILY_API_KEY` tetap fallback (dev). Tanpa key → Discovery throw → session `failed` (fail-safe). Rotasi: re-run script / tambah entri Vault nama sama (RPC ambil terbaru).
- [ ] **Pipeline riset E2E di production** — P0 cron sudah aktif; tinggal seed Tavily (atas) lalu submit form `/konten/baru` → pantau `/admin/riset` (cron */10 advance Discovery→Verification→Scoring→awaiting_selection).
- [ ] **Discovery iteratif** — `maximum_iterations`/`required_winners`/`minimum_score` tersimpan di session tapi discovery masih single-pass (belum loop). Future enhancement.
- [ ] **P2/P3 audit lain belum:** soft-delete guard scraper, ContentDraftCard error surfacing, duplikasi `getServiceClient`, `rate_limits` cleanup, realtime review (`supabase.channel`), middleware matcher persempit, INSERT anon limit, `target_category` validasi saat submit. (Admin consolidation P2 #12 sudah ditutup 1 Sep.)
- [ ] **Magic-link `token_hash` flow [USER STEP RE-PASTE]:** kode + template local di-push (`0cab152` parent, `2a8215d` submodule). Template base URL diubah `{{ .SiteURL }}/id/auth/exchange?...` → `{{ .RedirectTo }}?...` (fix bug email production bawa URL localhost — `.SiteURL` resolve ke Dashboard Site URL default `http://localhost:3000`). User **re-paste** body `supabase/templates/magic_link.html` ke Supabase Dashboard → Auth → Email Templates → Magic Link (template lama di Dashboard masih `{{ .SiteURL }}`). Verifikasi: request magic link → link harus `https://asharu.id/id/auth/exchange?token_hash=...` (bukan localhost). [HYGIENE opsional] Set Dashboard Site URL = `https://asharu.id`.
- [x] Verifikasi env produksi: `CRON_SECRET` diset di Vercel Production (user, 2 Sep) ✓; `NEXT_PUBLIC_*` live (domain aktif) ✓. Sisa: `TAVILY_API_KEY` (via Vault, lihat item seed di atas).
- [x] Verifikasi DB live via MCP asharu (blocker lama "tersambung albot-be" teratasi 31 Agu): key storage = semua 4 di Vault (0 plaintext) ✓; distribusi `content_requests` = {needs_review:1, processing:3 nyangkut} ✓; `get_llm_key` grants ✓ (kini service_role saja). Sisa: cek error `llm_call_logs` terakhir.
- [ ] Data placeholder (`src/data/*`, `public/images/*`) HARUS diganti data terverifikasi sebelum launch publik penuh; Tokopedia/TikTok Shop masih `hidden: true`.
- [ ] Realtime review (`supabase.channel`) direncanakan tapi belum diimplementasi.
- [ ] QA manual: Lighthouse ≥90/95/95/95, screen reader/keyboard di perangkat nyata.
- [ ] Transisi dual-write → DB-only (rencana fase lanjut).

## Recent Entries

- [2026-09-02 102000-content-pipeline-4stage.md](2026-09-02/102000-content-pipeline-4stage.md) — Content pipeline 4-tahap (Discovery→Verification→Scoring→Development) + Tavily search + affiliate top-20 scoring + admin riset pages + affiliate card review. 199 tests.
- [2026-09-01 162500-admin-list-i18n-loading-fix.md](2026-09-01/162500-admin-list-i18n-loading-fix.md) — Fix i18n keys literal di list page (admin namespace missing di CLIENT_MESSAGE_NAMESPACES) + loading feedback (useFormStatus → useTransition).
- [2026-09-01 144500-admin-ux-polish-and-digest-fix.md](2026-09-01/144500-admin-ux-polish-and-digest-fix.md) — Fix digest 2948654141 (`usePathname` di KontenList server) + polish UX: success state, loading skeletons, error boundaries, approve/reject optimistic, useFormStatus/useTransition spinners.
- [2026-09-01 123000-admin-quick-wins.md](2026-09-01/123000-admin-quick-wins.md) — Admin quick wins: dashboard `/admin`, list `/admin/konten`, admin nav, post-login → /admin, profiles.is_admin single source of truth (P2 #12 closed).
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
