# Pisah Navigasi Admin + Fix Kategori + Generate Idea LLM

Created: 2026-09-04

## Objective
1. Pisah navigasi admin dari public biar tidak berdesakan.
2. Fix pilihan kategori di Buat Konten Afiliasi yang belum update (hardcode 4 -> dynamic 6).
3. Tombol Generate Idea LLM yang isi semua field form otomatis + feedback jelas, rate limit 30/jam.

## Scope
- In: Header/NavMenu/MobileNav, admin/layout + AdminTopBar, konten/baru/page + ContentRequestForm, lib/content/actions (generateIdea + enum kategori), messages, category dynamic fetch, llm pool.
- Out: Tavily integration for idea (future), DB category enum constraint.

## Milestones
1. Pisah nav admin ke secondary top bar
2. Fix kategori dynamic
3. Generate idea semua field 30/jam

## Tasks
- [x] `src/components/admin/AdminTopBar.tsx` baru — secondary bar horizontal scroll, active state via `usePathname`, `adminNavItems`
- [x] `src/app/[locale]/admin/layout.tsx` baru — `isAdmin` guard, render `AdminTopBar` + children
- [x] `src/components/layout/Header.tsx` — hapus `adminNavItems`/`isAdmin`, hanya `mainNavItems`
- [x] `NavMenu.tsx` — hapus `adminItems` prop, doc "admin via AdminTopBar"
- [x] `MobileNav.tsx` — hapus `adminItems` prop, drawer hanya public
- [x] `src/app/[locale]/konten/baru/page.tsx` — fetch `categories` DISTINCT dari `affiliate_products` (fallback 6 enum), pass `categories` ke form; label map Otomotif/Lainnya
- [x] `ContentRequestForm.tsx` — props `{platforms, categories}`, controlled state untuk semua field (topic, platform, tone, language, targetCategory, audience, ctaStyle, purpose, constraints, keywords + advanced), dynamic `<select>` kategori, tombol ✦ Generate Idea (`aria-busy`, spinner, `useTransition`), `ideaApplied` banner emerald + `ideaError` alert, `showAdvanced` auto-expand, 30/jam rate_limit handling
- [x] `lib/content/actions.ts` — `researchSchema`/`requestSchema` `targetCategory` jadi `z.enum([...6]).optional()`, add `GenerateIdeaResult` + `generateIdea()` (checkRateLimit `generate_idea` 30, prompt `buildIdea` system+user, `runLLMCompletion` stage `idea_generation` temp 0.85 maxTokens 900, JSON parse strip ```, incrementRateLimit)
- [x] `messages/id|en.json` — `content.form.generateIdea, generating, generateIdeaHint, ideaApplied` + `nav.adminLlm`
- [x] Tests fix `ContentRequestForm.test.tsx` tambah `categories` mock
- [x] Gate: typecheck ✓ lint ✓ 240 tests ✓ build ✓ (routes `/admin` now wrapped by layout, `/konten/baru` 5.68kB)

## Risks
- Admin layout guard duplikat dengan individual pages — mitigasi layout guard central, pages tetap guard (idempotent).
- Dynamic categories DISTINCT bisa lambat jika affiliate_products besar — mitigasi `limit 1k` via select category only, dedup in-memory, index on category.
- LLM hallucination untuk allowed/excluded — mitigasi prompt schema ketat + user review sebelum Save, tidak auto-submit.
- Rate limit 30/jam per IP via DB `rate_limits` — perlu `scope` baru, tidak clash dengan `content_request` 5/jam.

## Progress Log
- 2026-09-04 — Plan dibuat read-only, konfirmasi secondary bar + dynamic + semua field 30/jam.
- 2026-09-04 — Build aktif: implementasi 3 fitur, gate hijau, plan file ditulis.

## Notes
- Future: kategori enum constraint di DB `CHECK category IN (...)` untuk validasi server-side lebih ketat.
- Generate idea tanpa Tavily (pure LLM) untuk cepat; iterasi berikutnya bisa tambah 1 query Tavily grounding jika diperlukan.
