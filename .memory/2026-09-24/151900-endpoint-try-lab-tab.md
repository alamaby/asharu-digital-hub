# Endpoint Try — Tab Chat Lab /lab/try

Created: 2026-09-24 15:19:00 WIB

## Task

Tambah tab "Coba Endpoint" di Chat Lab (`/lab/try`): user login bisa input `kind` (OpenAI-compatible / Anthropic) + `baseUrl` + `apiKey` (transit memori saja, tidak disimpan), klik "Uji & List Model", lalu chat (termasuk streaming) ke endpoint arbitrer via proxy server, dengan riwayat tersimpan di DB tanpa key.

## Key Files Changed

- `supabase/migrations/20260924000001_endpoint_try_runs.sql` — table baru + RLS + indexes
- `src/lib/endpoint-try/types.ts` — tipe domain
- `src/lib/endpoint-try/validation.ts` — Zod schemas + SSRF guard (localhost/private IP blocked)
- `src/lib/endpoint-try/adapters.ts` — normalisasi OpenAI/Anthropic + SSE parser + tokensPerSec
- `src/lib/endpoint-try/actions.ts` — server actions CRUD history + quota
- `src/app/api/endpoint-try/models/route.ts` — proxy GET /models
- `src/app/api/endpoint-try/chat/route.ts` — proxy POST /chat non-stream + SSE stream
- `src/app/[locale]/(admin)/lab/try/page.tsx` — halaman server
- `src/components/lab/EndpointTryClient.tsx` — komponen klien tab coba
- `src/components/lab/LabPageClient.tsx` — tab navigasi Compare/Coba Endpoint
- `src/i18n/routing.ts` — tambah route `/lab/try`
- `src/messages/id.json`, `src/messages/en.json` — namespace `lab.try.*`
- `src/app/api/lab/cleanup/route.ts` — extend cleanup endpoint_try_runs expired
- `plans/2026-09-24-endpoint-try-lab-plan.md` — master plan

## Technical Decisions

- `base_url` disimpan plaintext (putusan user) — bukan secret karena ini URL publik.
- `api_key` transit memori saja, tidak pernah disimpan/dilog.
- Localhost/private IPs diblokir default di production (SSRF guard).
- Rate limit 30 req/jam/IP (`endpoint_try` scope) pakai pattern `src/lib/content/rate-limit`.
- Retensi 30 hari via kolom `expires_at`; cleanup via cron sama dengan lab batches.
- Tidak pakai `src/lib/llm/providers/openai-compatible.ts` (paksa `response_format: json_object`).

## Verification

- Typecheck: hijau ✅
- Lint: 0 errors, hanya warning pre-existing ✅
- Tests: 68 tests baru (`validation.test.ts` 33, `adapters.test.ts` 24, `actions.test.ts` 11) ✅

## Commits

- Submodule `supabase`: `12129c6` — `feat(supabase): endpoint_try_runs table with RLS + indexes`
- Parent: `991013a` — `feat(lab): add Endpoint Try tab at /lab/try with proxy API routes`

## Blockers / Unresolved

Tidak ada. Semua langkah implementasi selesai dan ter-push.
