# Content Factory Fase 2 — Provider Abstraction + Processor

Created: 2026-08-28 23:05:00

## Objective
Membangun lapisan abstraksi LLM multi-provider (DB-driven priority, multi-key round-robin + fallback + circuit breaker) dan processor Route Handler yang mengubah `content_requests` (pending) menjadi `content_drafts` (thread `main`/`replies` + 1 produk ASH-XXX) secara otomatis, dengan logging dan cron.

## Scope
- `src/lib/llm/*` — types, prompt, key-pool, registry, 4 provider (naraya/openrouter/gemini/cloudflare)
- `src/lib/supabase/vault.ts` — helper decrypt key via Vault/service_role
- `src/app/api/content/process/route.ts` — processor (maxDuration 60, SKIP LOCKED, 1-product select, bilingual thread JSON, Zod, fallback)
- `vercel.json` — cron `*/5 * * * *` (sinkron dengan scraper 4-hari, tidak bentrok)
- Tests `key-pool.test.ts` + provider mocks
- `scripts/seed-llm-keys.mjs` — interactive seed (no secret log)

## Design Detail

### Provider Interface
- `LLMProvider` slug + `chat(ChatInput): Promise<ChatOutput>` (pure, testable).
- `ChatInput`: model, messages, temperature, maxTokens.
- `ChatOutput`: text, usage, provider, model, keyId.

### Key Pool
- Query: `SELECT * FROM llm_provider_keys WHERE provider_id=$1 AND is_active ORDER BY priority ASC, last_used_at NULLS FIRST, usage_count ASC, failure_count ASC LIMIT 1`.
- Round-robin: `UPDATE ... SET usage_count=usage_count+1, last_used_at=now() WHERE id=$1`.
- Fallback: loop keys ordered, try `chat` dengan key ter-decrypt; on 429/5xx → `failure_count++`, next key; `failure_count>5` → `is_active=false` (circuit breaker).
- Vault decrypt: `SELECT vault.decrypted_secret FROM vault.decrypted_secrets WHERE id = vault_secret_id` (service_role).

### Prompt
- `src/lib/llm/prompt.ts` — `buildThreadPrompt(request, product, platform)` → system: “Inject EXACTLY 1 {{PRODUCT_URL}} naturally in ONE post (main or reply), bilingual JSON, text murni, max_chars per platform, tone/audience/cta_style/purpose/constraints”.

### Processor
- `POST /api/content/process` (Vercel Cron GET also). Auth: `Authorization: Bearer ${CRON_SECRET}` atau `x-vercel-cron` header.
- Steps: `SELECT pending LIMIT 5 FOR UPDATE SKIP LOCKED` → `UPDATE processing` → `SELECT 1 product WHERE category=target_category ORDER BY random()` (atau random jika null) → `Registry.getOrderedProviders()` (`ORDER BY priority`) → `KeyPool` → `LLM.chat` → `INSERT draft` (generated_thread, injections `[{friendly_code, url, post_index}]`, llm_meta) → `UPDATE request needs_review` → `INSERT llm_call_logs`.

## Tasks
- [x] `src/lib/llm/types.ts`
- [x] `src/lib/llm/key-pool.ts` + `vault.ts`
- [x] `src/lib/llm/registry.ts`
- [x] `src/lib/llm/providers/{openrouter,naraya,gemini,cloudflare}.ts`
- [x] `src/lib/llm/prompt.ts`
- [x] `src/lib/llm/key-pool.test.ts` (4 tests)
- [x] `src/app/api/content/process/route.ts` (maxDuration 60, SKIP LOCKED, 1-product, bilingual thread JSON)
- [x] `vercel.json` cron `*/5 * * * *`
- [x] `scripts/seed-llm-keys.mjs` (interactive, no log secret)
- [x] Gate: lint ✓ typecheck ✓ test 156 ✓ build ✓
- [ ] Commit + push (submodule jika ada perubahan)

## Risks
- **Gemini/Cloudflare format** — perlu adapter; test mock fetch.
- **Vault decrypt latency** — cache 5 menit di KeyPool.
- **Cron Hobby limit** — Vercel Hobby daily; fallback `pg_cron` jika perlu.
- **Exactly 1 product** — Zod + retry 1x.

## Progress Log
- 2026-08-28 23:05 — Plan dibuat, eksekusi dimulai.
- 2026-08-28 23:10 — Implementasi selesai. 4 provider, KeyPool RR+fallback, Vault helper, Prompt thread, Processor Route Handler, Vercel cron. Gate hijau (lint ✓ typecheck ✓ 156 ✓ build ✓). Commit + push.
