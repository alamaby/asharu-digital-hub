# Content Factory Workflow + Affiliate Injection

Created: 2026-08-28 09:00:00

## Objective
Membangun workflow content factory end-to-end untuk menghasilkan konten Threads/Twitter/Instagram/TikTok/LinkedIn/Facebook dengan **tepat 1 produk afiliasi** yang disisipkan natural, lewat pipeline:

Form web (Server Action) → Supabase → processor (Route Handler + cron) → Multi-provider LLM (priority DB-driven) → Supabase → halaman review (admin, copy-to-clipboard).

Mendukung **multi-provider** (naraya → openrouter → gemini → cloudflare) dengan **multi-key round-robin + fallback** di tiap provider.

Migrasi dataset 201 affiliate dari `src/data/affiliate-products.ts` ke tabel `affiliate_products` dengan `friendly_code` (ASH-001..ASH-201) + incremental upsert (hanya 2 baru per scrape).

## Keputusan Terkunci
- **Submodule:** `https://github.com/alamaby/asharu-supabase` (sudah diclone sibling, masih kosong)
- **Auth:** Supabase Magic Link OTP, admin `alam.aby.b@gmail.com` + `alamaby@gmail.com`
- **Form fields:** `topic, platform, tone, target_category, audience, cta_style, purpose, constraints, keywords, language` (id/en/both)
- **Affiliate injection:** **tepat 1 produk** (wajib), disisipkan di `main` atau salah satu `replies`
- **MVP output:** copy-to-clipboard (tidak auto-publish ke API Threads/Twitter)
- **Provider fallback:** dinamis via `priority` di tabel (bukan hardcode), order MVP: naraya(10) → openrouter(20) → gemini(30) → cloudflare(40)
- **Secret:** Vault (pgsodium) — tidak ada di env/chat/repo
- **Rate limit:** 5/jam/IP + honeypot
- **Bilingual:** single JSON call (`{main:{id,en}, replies:[{id,en}]}`)
- **Tone values:** casual, formal, witty, professional, friendly, edukatif
- **Platform values:** threads, twitter, instagram, tiktok, linkedin, facebook (dengan `max_chars` per platform)
- **Image strategy:** tetap di `/public/images/...` (dual-write, incremental commit)
- **Migrated products:** soft-delete via `is_active=false`
- **Workflow strategy:** **Dual-write (Fase 1-2)** → DB-only (Fase 3+)

## Scope
- Submodule `supabase/` dengan migrations + seed
- `src/lib/supabase/{client,server}.ts` (SSR helpers)
- `src/lib/llm/*` (4 provider + key pool + registry)
- `src/app/api/content/process/route.ts` (processor)
- `src/app/[locale]/{konten/baru,konten/review,masuk}/page.tsx` (form, review, login)
- `src/components/content/*` (form, draft card, copy button)
- i18n `content.*` (id/en)
- Workflow incremental scrape (`scripts/scrape-affiliate.mjs` dual-write)
- `vercel.json` cron
- `src/middleware.ts` extend untuk guard review
- `src/lib/env.ts` + `.env.example` extend (SUPABASE_*)
- README + plan update

## Milestones (3 Commit)

### Fase 1 — Foundation (Submodule + DB + Auth + Env)
### Fase 2 — Provider Abstraction + Processor
### Fase 3 — Form + Review UI + Workflow Dual-Write

## Tasks

### Fase 1 — Foundation
- [ ] `git submodule add https://github.com/alamaby/asharu-supabase supabase`
- [ ] Setup Supabase project baru (user setup di Dashboard), catat `project_ref` + `SUPABASE_URL` + `anon key` + `service_role key`
- [ ] Install Vault: `CREATE EXTENSION IF NOT EXISTS pgsodium;` (atau supabase_vault)
- [ ] Migration `supabase/migrations/001_content_factory.sql`:
  - `platforms` (slug, display_name, max_chars, is_active) — seed 6
  - `affiliate_products` (id uuid, friendly_code ASH-XXX, external_id, name_id/en, category, merchant, url, image, is_active, created_at, updated_at) + trigger `gen_friendly_code()` + seed dari data existing (id lama `affiliate-XXX` → friendly `ASH-001`..`ASH-201`)
  - `llm_providers` (slug, display_name, base_url, is_active, priority) — seed 4 (naraya, openrouter, gemini, cloudflare)
  - `llm_models` (provider_id, model_id, display_name, is_default)
  - `llm_provider_keys` (provider_id, key_encrypted via Vault, key_hash, priority, usage_count, failure_count, last_used_at, is_active)
  - `llm_call_logs` (provider, model, key_hash, tokens, latency_ms, request_id, draft_id, created_at)
  - `content_requests` (topic, platform_slug FK, tone, target_category, audience, cta_style, purpose, constraints, keywords, language, status, requested_by, created_at)
  - `content_drafts` (request_id, provider_id, model_id, generated_thread jsonb, affiliate_injections jsonb CHECK length=1, status, attempt, llm_meta, created_at)
  - `rate_limits` (ip, scope, count, window_start) — UPSERT pattern
  - `profiles` (id FK auth.users, email, is_admin) — seed 2 email admin
  - RLS: anon INSERT content_requests, authenticated admin SELECT content_drafts, service_role all
  - `is_admin()` SQL function membaca `auth.jwt()->>email`
- [ ] `npm i @supabase/supabase-js @supabase/ssr`
- [ ] `src/lib/supabase/client.ts` + `src/lib/supabase/server.ts` (SSR cookie pattern)
- [ ] Extend `src/lib/env.ts` (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) + `.env.example` + test
- [ ] `src/app/[locale]/masuk/page.tsx` (Magic Link OTP form)
- [ ] Extend `src/middleware.ts` (guard `/konten/review`)
- [ ] Gate: `lint typecheck test build`

### Fase 2 — Provider Abstraction + Processor
- [ ] `src/lib/llm/types.ts` (LLMProvider, ChatInput, ChatOutput, ProviderSlug, ThreadGeneration)
- [ ] `src/lib/llm/key-pool.ts` (round-robin via `ORDER BY priority, last_used_at NULLS FIRST`, fallback loop, circuit breaker `failure_count > 5`)
- [ ] `src/lib/llm/registry.ts` (DB-driven, no hardcode; `getProviderBySlug(slug)`)
- [ ] `src/lib/llm/providers/openrouter.ts` (OpenAI-compatible)
- [ ] `src/lib/llm/providers/naraya.ts` (OpenAI-compatible `https://router.bynara.id/v1`)
- [ ] `src/lib/llm/providers/gemini.ts` (`generateContent`, `responseSchema: JSON_OBJECT`)
- [ ] `src/lib/llm/providers/cloudflare.ts` (`/ai/run/{model}`)
- [ ] `src/lib/llm/prompt.ts` (bilingual thread system prompt, exactly 1 product, max_chars per platform)
- [ ] Tests: `key-pool.test.ts` (RR + fallback + circuit breaker)
- [ ] `src/lib/supabase/vault.ts` (helper: `getDecryptedKey(providerSlug)`)
- [ ] `src/app/api/content/process/route.ts` (`maxDuration=60`, `SKIP LOCKED LIMIT 5`, select 1 product, build prompt, call LLM, validate Zod, insert draft, update request, log)
- [ ] `vercel.json` cron `*/5 * * * *`
- [ ] `scripts/seed-llm-keys.mjs` (helper, interactive, no log secret)
- [ ] Gate

### Fase 3 — Form + Review + Workflow Dual-Write
- [ ] `src/app/[locale]/konten/baru/page.tsx` (RSC wrapper) + `src/components/content/ContentRequestForm.tsx` (`'use client'`, Zod, `useTranslations(content.*)`, honeypot, `aria-live`, `min-h-touch`)
- [ ] `src/lib/content/rate-limit.ts` (5/jam/IP via `rate_limits` table)
- [ ] `src/app/[locale]/konten/review/page.tsx` (RSC protected) + `src/components/content/ContentDraftCard.tsx` (tab id/en, render `main` + `replies` terpisah, chip `ASH-XXX` + `post_index` highlight, copy per-post, edit inline, approve/reject, Realtime via `supabase.channel`)
- [ ] `src/components/content/CopyButton.tsx` (`navigator.clipboard.writeText` + toast)
- [ ] `src/lib/seo/metadata.ts` (`/konten/*` `noindex`)
- [ ] i18n `content.*` (id+en, 20+ keys) + `messages.test.ts` parity
- [ ] `scripts/scrape-affiliate.mjs` dual-write: query Supabase untuk `external_id` existing, upsert baru (dengan `friendly_code` auto-generated via trigger atau RPC), sinkron file `src/data/affiliate-products.ts` (regenerate dari DB agar `ASH-001` sinkron)
- [ ] README update (Content Factory section + dual-write + cron)
- [ ] `supabase db push`
- [ ] Gate

## Risiko
- **Vault tidak enabled:** `supabase_vault` perlu enable di dashboard sebelum migration pakai `vault.create_secret()`. Mitigasi: fallback `encrypted_key` text di migration dengan `pgp_sym_encrypt` + `_key_id` di config.toml.
- **Gemini JSON mode:** butuh `responseSchema` atau `response_mime_type="application/json"`. Mitigasi: prompt `Output JSON ONLY` + `JSON.parse` try/catch + retry 1x.
- **Cloudflare model IDs:** dinamis, seed spesifik model (`@cf/meta/llama-3-8b-instruct`). Default model per provider ditabel.
- **Build-time Supabase dependency (Fase 3 nanti):** untuk dual-write, file tetap jadi source build, tidak butuh Supabase saat `next build`. Jadi build aman.
- **Cron rate limit:** 5/jam/IP `5` saja, bisa tuning. Honeypot + Turnstile opsional (Turnstile tidak diset di MVP agar hemat).

## Progress Log
- 2026-08-28 09:00 — Plan final disusun. Fase 1 siap dieksekusi (submodule + migration + auth + env).
