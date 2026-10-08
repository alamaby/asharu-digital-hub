# Product Gap Analysis — Asharu Digital Hub

Created: 2026-10-08
Scope: public product presence for Indonesian UMKM, Claude Startups review readiness.
Source of truth: repository code at `main` (`cb7d012`).

## 1. Executive summary

The repository is a production-grade Next.js 15 + Supabase content-factory (research → draft → review, LLM waterfall via Vault keys, Threads queue, Studio visual, Chat Lab). Public positioning today is a general hub: online stores, affiliate products, properties, articles, about.

Intended positioning is narrower: an AI-assisted content operations and portfolio workspace for Indonesian UMKM with workflow Research → Compose → Review → Publish → Portfolio and a Content-to-Portfolio differentiator.

Gap utama: tidak ada rute produk khusus, tidak ada narasi UMKM, tidak ada portfolio pipeline yang terlihat publik, tidak ada waitlist/pilot CTA, README dan metadata belum menjelaskan workspace UMKM. Fondasi teknis (LLM, review, rate-limit, i18n, SEO) sudah kuat dan dapat dipakai ulang.

## 2. Current product state

* Framework: Next.js 15 App Router, React 19, TS strict, Tailwind 4.3, next-intl v4 (`id` default, `en`), Zod, Supabase (auth Magic Link, Postgres+RLS, Vault, pg_cron+pg_net).
* Rendering: public SSG/ISR (`revalidate 3600`); `(admin)` dynamic + middleware guard (`src/middleware.ts`, `src/lib/auth/route-guards.ts`).
* Public routes (`src/i18n/routing.ts`): `/`, `/products` (`/id/produk`), `/properties`, `/artikel`, `/about`, `/privacy-policy`, `/affiliate-disclosure`, `/masuk`, plus login/admin (`/studio`, `/lab`, `/konten/baru`, `/admin/*`, `/konten/review`).
* Content factory: `/konten/baru` (anon+rate-limit+honeypot → `createResearchSession`), `/admin/riset`, topics shortlist/reject/advance, `/konten/review` approve/reject, `/api/content/process` orchestrator (`maxDuration 300`), legacy `/api/content/process-legacy`.
* LLM: DB-driven `llm_providers.priority` → `llm_models` → `llm_provider_keys` round-robin + circuit breaker; providers naraya/openrouter/gemini/cloudflare; keys in Vault via `public.vault_*` RPC; per-stage defaults `llm_stage_defaults`; logs `llm_call_logs`; deadline total 240s + `fetchWithTimeout` 90s.
* Search: Tavily via Vault `tavily_api_key`, env fallback dev.
* Social: Threads queue (`social_post_configs`, `social_post_logs`, claim guard `claimed_at`, reaper), Playwright poster manual. No verified direct auto-publish claim in UI.
* Visual: Studio + batch, Flux/img2img, reaper `pending` macet.
* Analytics: GA4 consent-gated opt-in, 7 type-safe events, no PII.
* Security headers: CSP + HSTS + nosniff + Referrer-Policy + Permissions-Policy + frame-ancestors none.
* i18n: localized pathnames, `localeDetection:false`, `id.json`/`en.json` parity tested.
* SEO: `buildMetadata` canonical+hreflang, sitemap+robots, JSON-LD (WebSite, Organization, ItemList, RealEstateListing, Article+FAQ, Breadcrumb), OG/Twitter, Bing + Meta verification.

## 3. Current public positioning

Homepage (`src/app/[locale]/(public)/page.tsx`): hero “Semua yang Anda cari, dalam satu tempat”, sections afiliasi → properti → toko → medsos → math app + about teaser + contact CTA. Audience implisit: pengunjung umum/pembeli, bukan pemilik UMKM. Tidak ada kata UMKM, workspace, workflow, portfolio, human approval.

## 4. Intended positioning

Asharu Digital Hub: workspace operasi konten + portofolio digital berbantuan AI untuk UMKM Indonesia. Alur: Riset → Susun → Tinjau → Publikasikan → Bangun Portofolio. Diferensiator: Aktivitas usaha → bukti → brief → draft ditinjau → konten siap terbit → entri portofolio. Bukan generator caption generik. AI membantu, manusia menyetujui. Bahasa Indonesia alami untuk pemilik non-teknis.

## 5. Functional gaps

* P0: no `/digital-hub` route; no waitlist/pilot form; no portfolio entity visible; publish described as export/prepare only (correct, keep).
* P1: no BusinessProfile/Activity/Opportunity/Brief/Draft/Review/Publication/Portfolio typed model in repo; existing `content_research_sessions/topics/drafts` covers riset→draf but not activity→portfolio mapping.
* P2: no repurposing across channels UI, no portfolio public list, no scheduling UI beyond queue.

## 6. UX gaps

* P0: no 5-stage visual progression; no illustrative catering example labeled as illustration; no status label (Prototype/Beta/Waitlist).
* P1: nav does not surface product; homepage does not link to product.
* P2: mobile workflow board, empty states for portfolio.

## 7. Content and messaging gaps

* P0: missing ID hero “Ubah aktivitas usaha menjadi konten dan portofolio yang membangun kepercayaan”, problem section respectful, responsible-AI section, target segments (7).
* P1: EN parity, FAQ for SEO, glossary UMKM.
* P2: case studies (must remain illustrative until real pilots).

## 8. AI integration gaps

* Existing is strong (waterfall, timeout, logs, stage defaults). Gaps:
* P0: no public AI disclosure page/section; schemas for brief/review/portfolio not isolated as documented boundary.
* P1: structured-output validation for review severity (Critical/Major/Minor) and anti-invention guard for portfolio not yet explicit in code; prompt-injection separation (system vs untrusted business data) documented but not enforced in one helper.
* P2: token/cost dashboard public, Indonesian eval report.

## 9. Trust and transparency gaps

* P0: privacy page exists but no AI-usage disclosure, no data-deletion request process, no “jangan masukkan password/API key/NIK/data nasabah” reminders near forms.
* P1: terms of use draft, contact reuse via `contactConfig` only.
* P2: independent audit log.

## 10. SEO and structured-data gaps

* P0: no `/digital-hub` metadata (ID title/desc per spec), no sitemap entry, no SoftwareApplication/WebApplication/FAQPage/Breadcrumb for product.
* Current `buildMetadata`/`jsonld` reusable; no fake reviews/pricing — must preserve.
* P1: OG image product-specific (reuse `opengraph-image.tsx` or placeholder documented).
* P2: hub.asharu.id compat note without DNS change.

## 11. Accessibility gaps

* Base is good (SkipLink, aria, focus-return, touch targets, reduced-motion global). For new page must ensure: one H1, hierarchy, labels, error announcements (`aria-live`), focus states, 44px targets, no color-only meaning, keyboard-only operable, 360–1440px no overflow.
* P1: screen-reader workflow descriptions, dialog/dropdown a11y for waitlist.

## 12. Security and privacy gaps

* Base is good (Vault keys server-only, Zod env fail-fast, safe-url, CSP, rate-limit atomic RPC, honeypot). For new form: server validation, honeypot, rate-limit scope `digital_hub_waitlist`, no PII console/server logs, no third-party silent send, external links `rel`, no open redirect.
* P1: rate-limit scope migration documented; no new secrets.
* No client AI credentials; `ANTHROPIC_*` not used (existing uses Vault pool) — keep pattern, document `AI_FEATURES_ENABLED`-equivalent via `hasSupabase`/stage defaults.

## 13. Documentation gaps

* P0: README still describes general hub; missing product summary, workflow, differentiator, status, Claude overview, privacy, roadmap for UMKM.
* Missing: `docs/product-brief.md`, `docs/architecture.md`, `docs/ai-safety.md`, `docs/privacy-and-data-flow.md`, `docs/claude-startups-readiness.md` (with copy-ready answers + evidence matrix).
* `.memory/` is current; `docs/` is new per task (no conflict — `project-docs/` holds release notes).

## 14. Startup-review readiness gaps

* Reviewer cannot answer in 2 minutes: what, who, problem, differentiation, Claude role, what works vs planned, how to run, responsible AI, why Indonesia UMKM.
* P0: evidence matrix mapping claims → repo path/URL → status.
* Must not claim: live product, direct publishing, testimonials, metrics, partnerships, certs.

## 15. Prioritized recommendations

P0 (truthful, buildable, understandable):
* Add `/digital-hub` public route (SSG, id/en) with sections A–H per spec.
* Honest waitlist/pilot-interest form (server+honeypot+rate-limit, mailto/WhatsApp fallback, no fake DB write).
* `BusinessProfile…PortfolioEntry` as typed interfaces + demo fixtures labeled synthetic + future persistence doc.
* Claude boundary: `BusinessContextService…PortfolioTransformationService` as thin wrappers over `runLLMCompletion` + Zod schemas (opportunity/brief/draft/review/portfolio) + Critical/Major/Minor + anti-invention guard + mock clearly synthetic.
* SEO truthful + README + 5 docs + AI disclosure + privacy reminders.
* Tests for render/nav/i18n/validation/approval/parsing/metadata/a11y.

P1 (credible application + early validation):
* Supabase `digital_hub_waitlist` migration (submodule) + retention doc; portfolio transform requiring evidence/missing-field flags; cost/token controls docs; pilot runbook.
* EN polish, FAQPage, OG product image.

P2 (later):
* Public portfolio list, cross-channel repurpose UI, scheduling integrations, cost dashboard, eval harness.

## 16. Implementation status after this task

* To be filled by `docs/implementation-report.md`: routes added, files added/modified, capabilities working vs prototype/planned, gates results, limitations, env vars, deployment steps, remaining P0/P1/P2, next command, diff summary.
