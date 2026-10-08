# Architecture — Asharu Digital Hub

Created: 2026-10-08.

## Stack (reuse, no migration)

Next.js 15 App Router + React 19 + TS strict, Tailwind 4.3, next-intl v4 (`id` default, `en`), Zod, Supabase (auth Magic Link, Postgres+RLS, Vault, pg_cron). Public SSG/ISR (`revalidate 3600`); `(admin)` dynamic + middleware guard.

## Routes

* Public: `/`, `/digital-hub` (`/id/digital-hub`, `/en/digital-hub`), `/products`, `/properties`, `/artikel`, `/about`, `/privacy-policy`, `/affiliate-disclosure`. `hub.asharu.id` compatible in copy only — no DNS change.
* Internal (login/admin): `/konten/baru`, `/konten/review`, `/admin/*`, `/studio`, `/lab`.
* Classification single source: `src/lib/auth/route-guards.ts` + invariant test.

## Public product page

`src/app/[locale]/(public)/digital-hub/page.tsx` (Server Component) + `WaitlistForm.tsx` (Client island). i18n via `src/messages/{id,en}.json` (`meta.digitalHub`, `nav.digitalHub`, `digitalHub`). Metadata via `buildMetadata` (canonical+hreflang, OG/Twitter). JSON-LD: `SoftwareApplication` (no ratings), `FAQPage` from visible Q&A, `BreadcrumbList`. Sitemap includes both locales.

## Domain model (typed, persistence future)

`src/lib/digital-hub/types.ts`: BusinessProfile, BusinessActivity, ContentOpportunity, ContentBrief, ContentDraft, ContentReview (Critical/Major/Minor), PublicationItem (`publicationMode: 'export' | 'schedule_prep'` — never `'direct'`), PortfolioEntry (`missingFields`, `evidence`). Fixtures in `fixtures.ts` flagged `DEMO_IS_SYNTHETIC`.

Mapping to existing tables: `content_research_sessions` ≈ activity+opportunity, `content_research_topics` ≈ opportunities, `content_drafts` ≈ drafts, review UI ≈ `ContentReview`, `social_post_logs` ≈ `PublicationItem` (prep only). Portfolio has no table yet — documented as P1 migration in `supabase/` submodule.

## AI boundary

`src/lib/digital-hub/services.ts` wraps existing `runLLMCompletion` (DB-driven provider pool, Vault keys, 90s per-call timeout, 240s waterfall deadline, `llm_call_logs` audit without prompt PII by default). Services: BusinessContext, Research, Brief, Composition, Review, Repurposing, PortfolioTransformation. System vs untrusted business data separated in `separateInstructions`. Structured output validated by `schemas.ts` (`parseJsonWithSchema`). `useMock:true` returns synthetic fixtures with `isMock:true` — UI must never label mock as Claude output. `assertHumanApproval` enforces `approvedBy+approvedAt` before any publish step.

Env: reuse `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `TAVILY_API_KEY` (Vault preferred). No `ANTHROPIC_API_KEY` yet — documented placeholder; when added, server-only, never `NEXT_PUBLIC_`.

## Waitlist

`src/lib/digital-hub/waitlist.ts` (server action) + `validation.ts` (Zod shared). Honeypot `website`, atomic rate-limit scope `digital_hub_waitlist` (5/hour/IP, fail-open like existing), no PII logging, no silent third-party send. Returns prefilled WhatsApp/mailto links from `contactConfig` (env-driven). Honest copy: data not auto-stored.

## SEO / a11y / security

Reuse `localizedPathname`, `JsonLd`, `SectionHeading`, `ExternalLink` (https/mailto/tel allowlist), CSP/HSTS headers, `safe-url`, consent-gated GA4. Form: labels, `aria-invalid`, `role=alert/status`, 44px targets, focus states, reduced-motion respected, semantic landmarks, no color-only meaning.

## Testing

Vitest: `validation.test.ts`, `schemas.test.ts` (incl. approval gate), `seo.test.ts`, extended `sitemap-robots.test.ts`, existing `messages.test.ts` parity. Manual: 360/390/768/1024/1280/1440, keyboard-only, screen reader spot-check.
