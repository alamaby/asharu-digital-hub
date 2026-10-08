# AI Safety — Asharu Digital Hub

Created: 2026-10-08. Applies to all AI-assisted flows (existing content factory + new Digital Hub boundary).

## Principles

1. Assistant, not autopilot. Human approves facts and publication.
2. Editable by default. Every AI artifact can change before use.
3. No auto-publish. Publication needs explicit, auditable approval (`approvedBy` + `approvedAt`).
4. Evidence over invention. Missing facts → `missingFields`, not fabricated copy.
5. Least data. Never ask for passwords, API keys, banking, ID numbers, confidential customer/health/financial data. Reminders sit next to forms.

## Review severity

* Critical: false/unsupported/misleading/sensitive/harmful claims.
* Major: missing context, contradictions, weak brand fit, wrong channel format.
* Minor: readability, tone, wording.
* Ordinary marketing language is never marked “verified” without evidence.

## Portfolio anti-invention

Must not invent: customer identity, order quantity/scale, financial outcome, performance improvement, testimonial, detail location, certification, completion date. If absent, list in `missingFields` and ask the owner. Distinguish fact vs generated narrative in UI copy.

## Prompt-injection boundary

`separateInstructions()` keeps system rules apart from untrusted business data (`<business_data>`). Model is told to treat business data as data, not instructions. Structured output is re-validated with Zod; parse failures surface as errors, not silent success. No prompt or business PII in logs by default (`response_text` truncated, no secrets).

## Keys, timeouts, cost

* Keys server-only in Supabase Vault (`llm_provider_keys`, `image_provider_keys`); never `NEXT_PUBLIC_`, never in client bundles, README, fixtures, or tests.
* Timeouts: 90s per provider call, 240s waterfall deadline (below `maxDuration 300`).
* Retries: key round-robin + provider fallback; empty/length-cutoff outputs count as failure and continue waterfall. Circuit breaker disables repeatedly failing keys.
* Cost-aware: per-stage model defaults (`llm_stage_defaults`), token/latency in `llm_call_logs`, eval via Chat Lab before rollout.

## Failure behavior

LLM down / no keys → honest error state, pipeline stays in retryable status, admin can Resume/Retry. Mocks (`isMock:true`) are dev-only and labeled synthetic.

## Human checkpoints

Research select → brief confirm → draft edit → review resolve → approve → export/schedule-prep → portfolio approve. Each step records who approved and when.
