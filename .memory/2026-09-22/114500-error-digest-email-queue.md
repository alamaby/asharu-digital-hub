# Error Digest Email Queue + Agregasi 30 Menit Per Kategori

Tanggal: 2026-09-22 11:45 (local)
Status: SELESAI + prod applied

## Ringkasan

Implementasi digest email error integrasi: semua kegagalan (Tavily, LLM, riset, automation, scrape, cron/API, Resend, image) masuk queue `error_events`, dikumpulkan per kategori+jendela waktu (default 30 menit), dikirim satu email rangkuman via tick pg_cron tiap 5 menit. Configurable via tabel `error_notification_configs` tanpa deploy.

## File diubah/dibuat

**Migrasi DB** (submodule supabase):
- `migrations/20260922000001_error_digest_queue.sql` — tabel `error_notification_configs` + `error_events` + seed 8 kategori + RLS admin-only
- `migrations/20260922000002_error_digest_cron.sql` — extend CHECK `automation_email_log.moment` + pg_cron job `asharu-error-digest`

**Lib inti** (baru):
- `src/lib/notifications/error-events.ts` — `reportError()` best-effort, fingerprint deterministik, `reportCronApiError()`
- `src/lib/notifications/error-digest.ts` — `runErrorDigestTick()`, `groupEvents()`; claim-first, never-throws
- `src/lib/notifications/actions.ts` — server action `updateErrorNotificationConfig()` (admin-only, Zod-like validasi manual)

**Sender**:
- `src/lib/automation/email.ts` — tambah `sendErrorDigestEmail()` + interface `ErrorDigestGroup`
- `src/lib/automation/email.test.ts` — +3 test baru

**Instrumentasi** (existing files):
- `src/lib/research/discovery.ts` — reportError di getSearchProvider throw + chunked=0
- `src/lib/research/orchestrator.ts` — reportError di catch advanceStage
- `src/lib/llm/completion.ts` — reportError sebelum throw final + triedProviders tracking
- `src/lib/supabase/vault.ts` — reportError di markKeyFailure/markModelFailure (next>5 → auto-disable)
- `src/lib/automation/runner.ts` — notifyFailure → queue-only (hapus sendFailureEmail langsung)
- `src/app/api/content/process/route.ts`, `automation/run/route.ts`, `content/process-legacy/route.ts` — handler_error reporting

**Endpoint baru**:
- `src/app/api/notifications/error-digest/route.ts` — target pg_cron tick
- `src/app/api/notifications/report/route.ts` — jalan masuk CI scrape (POST + Zod strict)

**Admin UI**:
- `src/components/admin/automation/ErrorDigestForms.tsx` — tabel config interaktif
- `src/app/[locale]/(admin)/admin/automation/page.tsx` — seksi digest + query config + EmailLogRow diperluas

**Wiring scrape**:
- `scripts/scrape-affiliate.mjs` — reportScrapeError di syncFailed + main().catch
- `.github/workflows/scrape-affiliate.yml` — step `Report failure to error digest` via curl POST

**Test baru** (19 file → 29 test hijau):
- `error-events.test.ts` (12), `error-digest.test.ts` (5), `actions.test.ts` (6), `error-digest/route.test.ts` (1), `report/route.test.ts` (5)

## Keputusan penting

- **B1 (401-unauthorized)**: DITUNDA — tidak dilaporkan (vektor spam). Tetap terlihat di log Vercel.
- **B2 (transisi)**: LANGSUNG penuh — email failure langsung dihapus, menggantikannya digest.
- **B3 (retensi)**: TIDAK auto-delete (v1). Event notified menumpuk selamanya; volume <50/hari.
- **B5 (Tavily parsial)**: TIDAK dilaporkan (hanya terminal). Parsial tetap di search_call_logs.
- **B6 (Chat Lab)**: DILAPORKAN sebagai `llm` stage=`chat_lab` — informatif.

## Blocker yang terselesaikan

- Migrai MCP dev timeout → ulang dengan single-statement SQL berhasil.
- Prod applied via MCP asharu: `20260922000001` + `20260922000002` = sukses.

## Verifikasi manual tersisa (B7)

- [ ] Set `failure_count=5` pada 1 key LLM test, trigger 1 failure, cek `error_events source='markKeyFailure'`, kembalikan status.
- [ ] Trigger 1 error via `POST /api/notifications/report` (Bearer CRON_SECRET) → tunggu ≤window+5mnt → email digest tiba → `notified_at` terisi.
- [ ] Buka `/id/admin/automation` → seksi "Notifikasi error (digest)" tampil 8 baris, ubah window → tersimpan.
- [ ] `npm run scrape:affiliate:dry-run` tetap jalan (tidak menulis event — by design).

## Commit

- Parent: `fe128ee` feat: error digest email queue+agregasi 30 menit per kategori
- Submodule: `e80a754` feat(db): error digest queue + cron migrasi 8 kategori
- Push: main ↑ both repos
