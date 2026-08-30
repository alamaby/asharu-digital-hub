# Content Factory Implementation — Fase 1–3 (28–29 Agu)

Recorded: 2026-08-30 21:43 (entri retroaktif untuk kerja 2026-08-28 s.d. 08-29)

## Task / Problem
Membangun workflow content factory end-to-end: form web → Supabase → processor (cron) → multi-provider LLM → halaman review admin, dengan tepat 1 produk afiliasi injected per thread bilingual (id/en).

## Key Files Changed
- Submodule `supabase/` (https://github.com/alamaby/asharu-supabase) + `supabase/migrations/20260828000000_content_factory.sql` — tabel `platforms`, `affiliate_products` (trigger `gen_friendly_code()` → ASH-XXX), `llm_providers/models/provider_keys/call_logs`, `content_requests`, `content_drafts` (CHECK shape thread + tepat 1 injection), `rate_limits`, `profiles` + RLS penuh + `is_admin()` + trigger `handle_new_user`.
- `src/lib/supabase/{client,server,service}.ts` — SSR cookie pattern + service client.
- `src/lib/llm/` — `registry.ts` (DB-driven priority), `key-pool.ts` (round-robin + fallback), `prompt.ts` (placeholder `{{PRODUCT_URL}}`), `types.ts`, `providers/{openai-compatible,naraya,openrouter,gemini,cloudflare}.ts`.
- `src/app/api/content/process/route.ts` — processor (claim optimistic, pilih produk acak, validasi Zod shape + tepat 1 placeholder + max_chars platform, insert draft + log).
- `src/app/[locale]/konten/baru/page.tsx`, `konten/review/page.tsx`, `masuk/page.tsx`; `src/components/content/{ContentRequestForm,ContentDraftCard,CopyButton}.tsx`.
- `src/lib/content/{actions,rate-limit}.ts` — Server Action (Zod, honeypot, rate limit 5/jam/IP), noindex `/konten/*`.
- `src/middleware.ts` — session refresh + guard `/konten/review`; `src/lib/env.ts` + `.env.example` — Supabase + CRON_SECRET.
- `scripts/scrape-affiliate.mjs` — dual-write (file + upsert Supabase, soft-delete); tests 162 total.

## Technical / Business Decisions
- Auth: Magic Link OTP, admin = `alam.aby.b@gmail.com` + `alamaby@gmail.com` (hardcode di middleware, page, SQL).
- Tepat 1 produk afiliasi (CHECK DB `jsonb_array_length = 1`), placeholder `{{PRODUCT_URL}}` diganti setelah validasi — mencegah URL halusinasi.
- Provider fallback dinamis via `priority` tabel (naraya 10 → openrouter 20 → gemini 30 → cloudflare 40), key pool round-robin, circuit breaker `failure_count > 5` → `is_active = false`.
- Key LLM di Supabase Vault (bukan env); `scripts/seed-llm-keys.mjs` interaktif.
- Output MVP = copy-to-clipboard (tanpa auto-publish API Threads/Twitter).
- Dual-write file+DB di fase awal, rencana DB-only belakangan.

## Assumptions / Risks
- Lihat entri audit 30 Agu (`214500-content-factory-audit.md`) — beberapa risiko terkonfirmasi (P0 cron auth, P1 plaintext key fallback, dll).

## Blockers / Unresolved
- Realtime (`supabase.channel`) direncanakan tapi belum diimplementasi di halaman review (teks UI menyebut realtime).

## Verification
- Gate hijau per fase: lint ✓ typecheck ✓ test 162 ✓ build ✓. Commit: `b72a086`+`e4294b3` (F1), `7a1f59f`+`58045a0` (F2), `9192444`+`a607f8b` (F3).

## Commit Proposal
(sudah ter-commit per fase — tidak ada commit baru)

## Related Plans
- `plans/2026-08-28-content-factory-workflow.md` (master), `-fase1.md`, `-fase2.md`, `-fase2-fixes.md`, `-fase3.md`
