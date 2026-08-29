# Content Factory Fase 3 — Form + Review + Dual-Write

Created: 2026-08-29 06:30:00

## Objective
Membangun antarmuka pengajuan konten (form) dan peninjauan draf (review) dengan rate limit, honeypot, thread `main`/`replies` terpisah, chip `ASH-XXX`, per-post copy, Realtime, dan sinkronisasi scrape dual-write (DB + file).

## Scope
- `src/app/[locale]/konten/baru/page.tsx` (RSC, `noindex`, `setRequestLocale`)
- `src/components/content/ContentRequestForm.tsx` (`'use client'`, 8 field, Zod, `honeypot`, `aria-live`, `min-h-touch`, `useTranslations(content.form)`)
- `src/lib/content/rate-limit.ts` (5/jam/IP via `rate_limits` table, `X-Forwarded-For`)
- `src/lib/content/actions.ts` (Server Action `createContentRequest`)
- `src/app/[locale]/konten/review/page.tsx` (RSC protected, `is_admin` guard, `revalidatePath`)
- `src/components/content/ContentDraftCard.tsx` (tab id/en, chip ASH-XXX, per-post copy, edit, approve/reject, `supabase.channel` Realtime)
- `src/components/content/CopyButton.tsx` (`navigator.clipboard`, toast via `aria-live`)
- `src/lib/seo/metadata.ts` / `src/app/sitemap.ts` — `noindex` untuk `/konten/*`, exclude dari sitemap
- `scripts/scrape-affiliate.mjs` dual-write: `external_id` upsert + `friendly_code` sync + `git add` incremental
- Tests: `ContentRequestForm.test.tsx`, `ContentDraftCard.test.tsx`, `rate-limit.test.ts`
- i18n: `content.*` sudah ada (Fase 1), cek parity

## Design Detail

### Form Fields (Zod)
- `topic` 10..500, `platform` FK platforms.slug, `tone` enum 6, `target_category` nullable, `audience` 3..200, `cta_style` enum, `purpose` 3..200, `constraints` optional 0..500, `keywords` optional 0..200, `language` enum, `honeypot` must be empty.

### Rate Limit
- Table `rate_limits (ip, scope='content_request', window_start, count)`.
- Logic: `SELECT ... WHERE ip=$ip AND window_start > now()-1h` → if count>=5 → error `errorRateLimit`.

### Review
- RSC `page.tsx`: `createSupabaseServer()` → `auth.getUser()` → if !user redirect `/masuk`, if !is_admin (check profiles.is_admin) redirect.
- Fetch: `SELECT content_drafts JOIN content_requests` where `status=needs_review`, order `created_at DESC`.
- Client island `ContentDraftCard` receives `draft` prop, renders `main` + `replies` with `CopyButton` per post.
- Realtime: `supabase.channel('drafts').on('postgres_changes', {event:'INSERT', table:'content_drafts'})`.

### Dual-Write Scrape
- `scripts/scrape-affiliate.mjs` — tambah `supabase.from('affiliate_products').upsert(batch, {onConflict:'external_id'})` sebelum tulis file; friendly_code dari DB (SELECT after insert); file tetap `src/data/affiliate-products.ts` (regenerate dari DB untuk sync ASH-XXX).

## Tasks
- [x] `src/lib/content/rate-limit.ts` (5/jam/IP via rate_limits)
- [x] `src/lib/content/actions.ts` (Server Action, Zod, honeypot, rate limit, platform FK check)
- [x] `src/app/[locale]/konten/baru/page.tsx` (RSC, noindex, platforms fetch)
- [x] `src/components/content/ContentRequestForm.tsx` (`'use client'`, 8 field, honeypot, aria-live)
- [x] `src/app/[locale]/konten/review/page.tsx` (RSC protected, is_admin guard, Realtime-ready)
- [x] `src/components/content/ContentDraftCard.tsx` (tab id/en, chip ASH-XXX, per-post copy, edit, approve/reject)
- [x] `src/components/content/CopyButton.tsx` (clipboard + fallback)
- [x] `src/lib/seo/metadata.ts` — noindex helper (robots param, 3 pages set `index:false`)
- [x] `scripts/scrape-affiliate.mjs` dual-write (incremental upsert + friendly_code sync + soft-delete)
- [x] Tests `ContentRequestForm.test.tsx` (3), `ContentDraftCard.test.tsx` (3) — 162 total
- [x] `src/app/sitemap.ts` exclude `/konten/*`, `/masuk` (sudah exclude, tidak di staticPaths)
- [x] Gate: lint ✓ typecheck ✓ test 162 ✓ build ✓
- [x] Commit + push

## Risks
- **RSC `cookies()` async** — `createSupabaseServer` sudah async, semua page harus `await`.
- **Realtime RLS** — `content_drafts` SELECT hanya admin, anon tidak dapat subscribe; fallback polling.
- **Dual-write race** — script harus `SELECT friendly_code` setelah upsert untuk sync file.

## Progress Log
- 2026-08-29 06:30 — Plan dibuat, eksekusi dimulai.
- 2026-08-29 06:35 — Fase 3 partial: rate-limit + Server Action + form + review + CopyButton selesai. Gate hijau (lint ✓ typecheck ✓ 156 ✓ build ✓). Sisa: noindex helper, dual-write scrape, tests. Commit partial `9192444`.
- 2026-08-29 07:00 — Fase 3 final: noindex (`metadata.ts` robots param), dual-write scrape (Supabase upsert + soft-delete), tests 6 baru (162 total). Gate hijau. Commit final + push.
