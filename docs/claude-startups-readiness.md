# Claude Startups Readiness

Created: 2026-10-08. Copy-ready drafts — adapt to implementation before submitting. Evidence matrix maps every claim to code/URL.

## A. What are you building?

> We are building Asharu Digital Hub, an AI-assisted content operations and digital portfolio platform for Indonesian micro and small businesses.
>
> Many small business owners have valuable products, completed projects, customer experiences, and practical knowledge, but lack the time, marketing staff, and structured workflow needed to consistently turn those assets into credible social media content.
>
> Asharu Digital Hub helps them research relevant content opportunities, compose platform-specific drafts, review content for clarity, consistency, and unsupported claims, and prepare approved content for publication. The platform also transforms completed business activities and selected published posts into reusable portfolio entries, helping businesses build a credible digital track record over time.
>
> We are integrating Claude into multi-step workflows for business-context analysis, content research, brief generation, drafting, review, repurposing, and portfolio creation, with human approval retained before publication.

## B. How will you use Claude?

> Claude will power the contextual reasoning and multi-step content workflows in Asharu Digital Hub.
>
> We plan to use the Claude API to analyze each business’s profile, products, target audience, communication style, prior content, and completed activities. Based on that context, Claude will help research content opportunities, generate structured briefs, compose platform-specific drafts, review content for clarity and consistency, identify unsupported claims, and repurpose approved content across different channels.
>
> Claude will also help convert completed business activities into structured case studies and portfolio entries. This enables small businesses to build a reusable digital record of their work rather than producing isolated social media posts.
>
> The API credits will be used to prototype these workflows, evaluate prompt and context strategies, measure content quality, test Indonesian-language performance, and validate the product with early UMKM users.

Current state: boundary and schemas exist (`src/lib/digital-hub/services.ts`, `schemas.ts`) over the existing DB-driven LLM pool; provider abstraction adds value only when Claude credentials land (server-side Vault, never client). Mocks are synthetic and labeled.

## C. Who are your target customers?

> Our initial target customers are Indonesian micro and small businesses that actively sell products or services through social media but do not have a dedicated content or marketing team.
>
> Initial segments include home-based product businesses, local service providers, culinary businesses, creative businesses, property agents, independent professionals, and small online merchants. These businesses need affordable assistance with content planning and production, but they also need a structured way to document completed work and build credibility with prospective customers.
>
> Legal entity: Asharu.id is an Indonesian sole proprietorship founded by Alam Aby Bashit in Bandung, West Java, in March 2023. Verified identity is visible on-site at [/id/tentang](/id/tentang) and via JSON-LD Organization schema.

## D. Six-month use of Claude API credits

* Month 1: Business onboarding, business-context extraction, structured brand profiles, baseline evaluation.
* Month 2: Content research, opportunity prioritization, structured brief generation.
* Month 3: Multi-channel composition, controlled brand voice, editable variants.
* Month 4: Content review, unsupported-claim identification, evidence prompts, human approval workflows.
* Month 5: Content repurposing and content-to-portfolio transformation.
* Month 6: Indonesian-language evaluation, UMKM pilot testing, cost/token optimization, launch readiness.

## Evidence matrix

| Claim | Implementation | Path / URL | Status | Remaining |
|---|---|---|---|---|
| Product page for UMKM with 5-stage workflow | `/digital-hub` SSG page, id/en | `src/app/[locale]/(public)/digital-hub/page.tsx` · `/id/digital-hub` | Done | OG product image polish |
| Content-to-Portfolio differentiator with labeled illustration | Flow + catering example | same page §Diferensiator | Done | Real pilot example later |
| Human approval before publish | `assertHumanApproval`, `approvedBy+approvedAt` | `src/lib/digital-hub/services.ts`, `types.ts` | Done | Wire to UI approve buttons |
| Review Critical/Major/Minor + anti-invention | Zod schemas + guards | `src/lib/digital-hub/schemas.ts` | Done | E2E eval on ID corpus |
| No auto-publish | `publicationMode: export\|schedule_prep` | `types.ts`, page copy | Done | Keep in any integration |
| LLM runs server-side, keys in Vault | Existing pool + boundary | `src/lib/llm/completion.ts`, `services.ts` | Done | Add Claude creds to Vault when available |
| Waitlist honest (no fake storage) | Server validation + contact links | `src/lib/digital-hub/waitlist.ts`, `validation.ts` | Done | Supabase table + retention (P1) |
| SEO truthful (no fake ratings) | `SoftwareApplication` w/o ratings, FAQ, Breadcrumb, sitemap | `src/lib/seo/jsonld.ts`, `src/app/sitemap.ts` | Done | — |
| Responsible AI visible | 8-point section + reminders | page §AI, `docs/ai-safety.md` | Done | — |
| Research→draft→review engine works | Content factory (login/admin) | `/konten/baru`, `/admin/riset`, `/konten/review` | Done (internal) | Portfolio table (P1) |
| Direct IG/TikTok publishing | Not implemented | — | Planned, not claimed | Explicit approval design first |

No testimonials, user counts, logos, partnerships, awards, revenue, case results, integrations, certs, or program acceptance are claimed.
