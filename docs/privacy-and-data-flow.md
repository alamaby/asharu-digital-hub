# Privacy and Data Flow — Asharu Digital Hub

Created: 2026-10-08. Draft for transparency — not legal advice.

## Data collected

* Onboarding/pilot form: name, business name, category, primary channel, biggest challenge, email/WhatsApp, consent flag. Honeypot ignored.
* Business profile (future): category, audience, products/services, area, brand voice, language, channels, prohibited claims.
* Content: drafts, reviews, evidence notes/photos entered by the owner.
* Contact: WhatsApp/email via `contactConfig` (env-driven, optional — CTAs hide when empty).
* Analytics: GA4 consent-gated opt-in only; events carry `item_id/item_category/platform/locale/link_position` — never names, emails, phones, addresses, or message bodies.

## Sent to AI provider

Only the text needed for the current step (profile excerpt, brief, draft). Keys stay in Vault; requests run server-side. Prompts are not logged with PII by default; `llm_call_logs.response_text` truncated to 8000 chars, errors to 2000.

## Logging

* App: rate-limit counters (IP+scope), research/audit logs (stage+message), LLM call metadata (provider/model/tokens/latency/status). No passwords/secrets/PII in logs.
* Pilot form server action logs only rate-limit failures and validation counts — never form contents.

## Retention

* Pilot interest: no automatic storage today (form prepares a contact message). When the `digital_hub_waitlist` table lands (P1), retain 12 months max, then delete; document exact window in this file.
* Research/draft logs: per existing content-factory retention (lab history 30 days; see `.memory/`).
* Rate-limit rows: cleaned by `cleanupExpiredRateLimits` via cron.

## Deletion & export

Request via official contact (email/WhatsApp from site footer/contact section). Owner verifies requester identity by matching contact channel, then deletes related rows and confirms within 14 days. Export provided as JSON on request. Document each request date (no contents) in admin notes.

## Access controls

Public pages: no auth. Internal workspace: login required; admin areas require `profiles.is_admin`. Service-role client only on server (`getServiceClient`); RLS enforced for user clients. Vault access via `SECURITY DEFINER` RPC, service-role only.

## Third-party processors

Supabase (hosting/DB/auth), Vercel (hosting), Tavily (search, when research runs), Resend (automation email, best-effort), Meta Threads API (only when queue worker enabled). No silent sending from the pilot form — user presses the contact button themselves.

## What not to enter

Passwords, API keys, banking, ID numbers, confidential customer data, private health data, unpublished financials. Reminders appear under the pilot form and in AI sections.
