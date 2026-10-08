# 2026-10-08 — Digital Hub product presence (public route + docs + gates)

## Task / problem

Implement credible public product presence for Asharu Digital Hub (UMKM workspace, Research→Compose→Review→Publish→Portfolio, Content-to-Portfolio differentiator) without breaking existing hub (stores/affiliate/properties/articles) and without fabricating claims/integrations.

## Key files changed

* Added: `src/app/[locale]/(public)/digital-hub/page.tsx`, `src/components/digital-hub/WaitlistForm.tsx`, `src/lib/digital-hub/{types,fixtures,validation,schemas,services,waitlist}.ts` + 3 tests, `docs/{product-gap-analysis,product-brief,architecture,ai-safety,privacy-and-data-flow,claude-startups-readiness,implementation-report}.md`.
* Modified: `src/i18n/routing.ts`, `src/config/navigation.ts`, `src/lib/auth/route-guards.ts`, `src/lib/i18n/client-messages.ts`, `src/app/sitemap.ts`, `src/lib/seo/jsonld.ts`, `src/lib/seo/sitemap-robots.test.ts`, `src/messages/{id,en}.json`, `README.md`.

## Decisions

* Route `/digital-hub` same slug both locales (`/id/digital-hub`, `/en/digital-hub`); public classification + sitemap + nav entry.
* Waitlist honest: server Zod + honeypot + atomic rate-limit scope `digital_hub_waitlist`, returns WhatsApp/mailto links from env-driven `contactConfig`; copy states data not auto-stored.
* No new DB table; domain as typed interfaces + synthetic fixtures; Claude as boundary over existing `runLLMCompletion` with Zod schemas, severity levels, anti-invention guard, `isMock` labeling, `assertHumanApproval`.
* SEO truthful: `SoftwareApplication` without ratings/offers, FAQ from visible Q&A, Breadcrumb; `docs/` new (no conflict with `project-docs/`).
* Zod types use `z.output` to keep defaults required in TS.

## Assumptions / risks

* Contact envs may be empty in some envs → form shows `formContactMissing`; acceptable and honest.
* Full lint slow locally but passes; CI Quality remains gate.
* Preview deploy not run from here; needs Vercel preview + smoke test.

## Blockers / unresolved

* P1: `digital_hub_waitlist` Supabase migration + retention update; portfolio table; product OG image; pilot runbook.

## Verification

* `npm run validate:messages` PASS; `npm run typecheck` PASS; `npm run lint` PASS; `npm test` 1341/1341 PASS (134 files); `npm run build` PASS (122 static pages incl. `/id/digital-hub`, `/en/digital-hub`).

## Conventional commit proposal

`feat(digital-hub): add public UMKM product page, waitlist, AI boundary, and docs`

## Related

* `docs/product-gap-analysis.md`, `docs/implementation-report.md`, `docs/claude-startups-readiness.md`.
