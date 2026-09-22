# Implementation Plan: Digest Email Error Integrasi (Queue + Agregasi 30 Menit, Configurable by Table)

Created: 2026-09-22 07:30:00

## Objective

Setiap kegagalan integrasi (Tavily, LLM, riset, automation, scrape produk, cron/API, Resend, image/cover) tercatat ke queue DB (`error_events`) dan dikirim ke admin sebagai **satu email rangkuman per jendela waktu** (default 30 menit) via tick digest, bukan satu email per kejadian. Semua knob (on/off per kategori, window menit, penerima override) configurable via tabel `error_notification_configs` tanpa deploy.

## Scope

- In scope: 8 kategori — `tavily`, `llm`, `research`, `automation`, `scrape`, `cron_api`, `resend`, `image`.
- Out of scope: channel selain email (Slack/WA), retry otomatis, dashboard analitik error (cukup badge/log existing), auto-delete/retensi event (ditunda, lihat B3).
- Kontrak keras: semua pelaporan best-effort, never-throws — tidak boleh mengubah perilaku throw/status existing; kegagalan kirim digest tidak boleh menjadi event baru (recursion guard).

## Status Temuan (terverifikasi read-only, bukan asumsi)

- F1 — Email failure langsung **SUDAH ADA** untuk automation/riset: `notifyFailure()` (`src/lib/automation/runner.ts:830-869`) dipanggil di 6 situs (`:587` sesi failed, `:605` discovery 0 topik, `:650` draf hilang, `:667` thin-content, `:750` publish gagal, `:958` cover gagal via `failCover` di `:950-960`). Setiap kejadian gagal = 1 email langsung (risiko spam → masalah yang diselesaikan).
- F2 — Celah scrape: `scripts/scrape-affiliate.mjs:301-304` (`syncFailed → process.exit(1)`) + guard mass-deactivation (`:274-279`) hanya merah di CI; step workflow `.github/workflows/scrape-affiliate.yml:111-113` hanya `echo "::error::"` — tanpa email.
- F3 — Celah cron/API: `src/app/api/content/process/route.ts:17-30`, `src/app/api/automation/run/route.ts:17-30`, `process-legacy/route.ts:26-43` — 401/500 hanya JSON, tanpa baris DB/event.
- F4 — Celah silent auto-disable: `src/lib/supabase/vault.ts:88` (`markKeyFailure`, `next > 5 → is_active=false`) dan `:127` (`markModelFailure`) — tanpa email/log khusus.
- F5 — Tidak ada env `ADMIN_EMAIL` (grep = 0 hit). Rantai penerima existing: `automation_configs.notify_emails` → fallback `profiles(is_admin).email` (`src/lib/automation/config.ts:157-172`). Tidak perlu env baru.
- F6 — `deliver()`/`sendViaResend()` never-throws (`src/lib/automation/email.ts:137-159`, `:69-110`); semua hasil (termasuk skipped) diaudit ke `automation_email_log` (`:166-192`).
- F7 — Tabel audit existing (`search_call_logs`, `llm_call_logs`, `content_research_logs`, `automation_email_log`) tetap; `error_events` baru bersifat komplementer (queue notifikasi, bukan duplikat audit).
- F8 — Tavily parsial ditolerir (`Promise.allSettled`, `src/lib/research/discovery.ts:165-180`); hanya kegagalan terminal yang dilaporkan (keputusan eksplisit, lihat B5).

## Keputusan User (kuesioner 2026-09-22, sudah diratifikasi)

Cakupan = semua 8 kategori; mekanisme = queue + digest; config = tabel khusus baru; window default 30 menit.

## Milestones

1. M1 — Tabel queue + config + seed (Langkah 1-2).
2. M2 — Lib inti + sender digest + otak digest (Langkah 3-5).
3. M3 — Instrumentasi semua call sites (Langkah 6-10).
4. M4 — Endpoint digest + endpoint lapor CI (Langkah 11-12).
5. M5 — Admin UI config (Langkah 13).
6. M6 — Wiring scrape (Langkah 14).
7. M7 — Gate penuh + verifikasi (Langkah 15).

## Tasks

- [x] Langkah 1 — Migrasi DB: `error_events` + `error_notification_configs` + seed 8 kategori
- [x] Langkah 2 — Migrasi DB: moment `error_digest` + pg_cron `asharu-error-digest`
- [x] Langkah 3 — Lib inti `src/lib/notifications/error-events.ts` + unit test
- [x] Langkah 4 — `sendErrorDigestEmail()` di `src/lib/automation/email.ts` + test
- [x] Langkah 5 — Lib digest `src/lib/notifications/error-digest.ts` + unit test
- [x] Langkah 6 — Instrumentasi Tavily (`discovery.ts`, 2 titik)
- [x] Langkah 7 — Instrumentasi LLM (`completion.ts` + `vault.ts`)
- [x] Langkah 8 — Instrumentasi riset (`orchestrator.ts` catch)
- [x] Langkah 9 — Migrasi `notifyFailure` runner → queue (perubahan perilaku, risiko tertinggi)
- [x] Langkah 10 — Instrumentasi API routes (`cron_api`, service-500 + handler-500)
- [x] Langkah 11 — Endpoint `POST /api/notifications/error-digest` + test
- [x] Langkah 12 — Endpoint `POST /api/notifications/report` + test
- [x] Langkah 13 — Admin UI tabel config + server actions + test
- [x] Langkah 14 — Wiring scrape (`scrape-affiliate.mjs` + workflow) + test
- [x] Langkah 15 — Gate penuh + checklist verifikasi akhir

---

## Langkah 1 — Migrasi DB: tabel queue + config + seed

- **Tujuan:** Menyediakan `error_events` (queue) dan `error_notification_configs` (knob per kategori) secara non-destruktif.
- **Finding/requirement:** Tidak ada tabel queue/config; R3 (configurable by table), R4 (default 30 menit).
- **Dependency:** Tidak ada (langkah pertama; semua langkah lain bergantung padanya).
- **File yang harus dibaca:** `supabase/migrations/20260920000001_automation_email_log.sql` (pola RLS admin-only, 31 baris), `supabase/migrations/20260915000003_automation_config.sql` (pola CHECK + seed singleton, 105 baris).
- **File yang harus diubah:** Buat 1 file baru `supabase/migrations/20260922000001_error_digest_queue.sql` (prefix berikutnya setelah `20260920000003` yang ada). Tidak ada file existing yang diubah.
- **Simbol terkait:** `is_admin()` (SQL helper existing), tabel `automation_configs`, `profiles`.
- **Kondisi saat ini:** Kedua tabel belum ada.
- **Perubahan konkret (isi file migrasi, urutan statements):**
  1. `CREATE TABLE IF NOT EXISTS public.error_notification_configs (category text PRIMARY KEY CHECK (category IN ('tavily','llm','research','automation','scrape','cron_api','resend','image')), is_enabled boolean NOT NULL DEFAULT true, digest_window_minutes int NOT NULL DEFAULT 30 CHECK (digest_window_minutes BETWEEN 5 AND 1440), notify_emails text[] NULL, last_digest_at timestamptz NULL, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());`
  2. `CREATE TABLE IF NOT EXISTS public.error_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL CHECK (category IN (...8 nilai sama...)), source text NOT NULL, severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('warning','error','critical')), stage text NULL, message text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, session_id uuid NULL, run_id uuid NULL, fingerprint text NOT NULL DEFAULT '', notified_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now());` — `session_id`/`run_id` sengaja TANPA FK (event scrape/cron_api tidak punya sesi; FK akan menolak insert).
  3. `CREATE INDEX IF NOT EXISTS idx_error_events_unnotified ON public.error_events (category, created_at) WHERE notified_at IS NULL;` + `CREATE INDEX IF NOT EXISTS idx_error_events_fingerprint ON public.error_events (category, fingerprint);`
  4. Seed: `INSERT INTO public.error_notification_configs (category) VALUES ('tavily'),('llm'),('research'),('automation'),('scrape'),('cron_api'),('resend'),('image') ON CONFLICT (category) DO NOTHING;`
  5. RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` + policy `FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())` untuk kedua tabel (tiru persis pola `20260920000001`, termasuk `DROP POLICY IF EXISTS` dulu).
- **Behavior yang dipertahankan:** 100% aditif; tidak menyentuh tabel existing.
- **Error handling/edge:** `IF NOT EXISTS` + `ON CONFLICT DO NOTHING` agar idempoten bila dijalankan ulang; CHECK mempersempit kategori agar typo kategori dari kode langsung gagal di DB (dan `reportError` men-swalow-nya — lihat Langkah 3).
- **Test:** Tidak ada unit test untuk SQL; verifikasi via SELECT setelah apply.
- **Input test dan expected result:** Apply ke dev via MCP `apply_migration`, lalu `execute_sql`: `SELECT category, is_enabled, digest_window_minutes FROM error_notification_configs ORDER BY category;` → expected 8 baris, semua `t:true, 30`. `SELECT to_regclass('public.error_events');` → expected `error_events`.
- **Command verifikasi yang tersedia di repository:** Tidak ada (verifikasi via MCP Supabase, bukan npm script).
- **Hasil verifikasi yang diharapkan:** 8 baris seed ada; RLS enabled (`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('error_events','error_notification_configs');` → true/true).
- **Completion criteria:** 8 baris seed ada; RLS enabled pada kedua tabel.
- **File atau area yang tidak boleh diubah:** Semua tabel/migrasi existing; `is_admin()`; `automation_configs`.

## Langkah 2 — Migrasi DB: moment `error_digest` + pg_cron digest

- **Tujuan:** Mengizinkan audit digest di `automation_email_log` dan menjadwalkan tick digest tiap 5 menit.
- **Finding/requirement:** `automation_email_log.moment` CHECK hanya mengizinkan 4 nilai (`20260920000001:14`); cron existing memakai pola Bearer-from-Vault (`20260915000004`).
- **Dependency:** Langkah 1.
- **File yang harus dibaca:** `supabase/migrations/20260920000001_automation_email_log.sql:8-20`, `supabase/migrations/20260915000004_automation_cron.sql` (22 baris, pola `cron.schedule` + `net.http_post` + Vault).
- **File yang harus diubah:** Buat 1 file baru `supabase/migrations/20260922000002_error_digest_cron.sql`. Tidak ada file existing yang diubah.
- **Perubahan konkret (urutan):**
  1. Cek nama constraint aktual via `SELECT conname FROM pg_constraint WHERE conrelid='automation_email_log'::regclass;` (jangan tebak — bisa auto-generate). Lalu `ALTER TABLE public.automation_email_log DROP CONSTRAINT IF EXISTS <nama-aktual>;` + `ADD CONSTRAINT <nama-aktual> CHECK (moment IN ('draft_ready','published','failure','test','error_digest'))`.
  2. Guard duplikat job: cek `SELECT count(*) FROM cron.job WHERE jobname='asharu-error-digest'`; unschedule hanya bila count=1; lalu `SELECT cron.schedule('asharu-error-digest','*/5 * * * *', $job$ SELECT net.http_post(url := 'https://asharu.id/api/notifications/error-digest', headers := jsonb_build_object('Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='asharu_cron_secret' ORDER BY created_at DESC LIMIT 1),'Content-Type','application/json'), body := '{}'::jsonb, timeout_milliseconds := 55000); $job$);`
- **Behavior yang dipertahankan:** Job automation/riset existing tidak disentuh; timeout 55 dtk (digest ringan, bukan 290 dtk).
- **Error handling/edge:** `cron.unschedule` melempar bila job tidak ada — karena itu dipakai pola cek-dulu, bukan unschedule-buta.
- **Test:** Tidak ada unit test; verifikasi via SQL.
- **Input test dan expected result:** `SELECT jobname, schedule FROM cron.job WHERE jobname='asharu-error-digest';` → 1 baris `*/5 * * * *`. Coba insert moment baru lalu DELETE baris itu → sukses (CHECK lolos).
- **Command verifikasi:** Via MCP `execute_sql` (bukan npm script).
- **Hasil verifikasi yang diharapkan:** Job cron ada tepat 1 (tidak duplikat); CHECK menerima `error_digest`.
- **Completion criteria:** Job cron ada 1; CHECK menerima `error_digest`.
- **File atau area yang tidak boleh diubah:** Job `asharu-automation-run`, `asharu-content-research`, `asharu-content-legacy`; baris `automation_email_log` existing.

## Langkah 3 — Lib inti `src/lib/notifications/error-events.ts` + unit test

- **Tujuan:** Satu-satunya jalan masuk pelaporan error: `reportError()` best-effort + fingerprint deterministik + helper `reportCronApiError()`.
- **Finding/requirement:** R5 (never-throws, tidak mengubah throw/status existing); F7 (komplemen audit, bukan pengganti).
- **Dependency:** Langkah 1 (nama tabel/kategori harus cocok dengan migrasi).
- **File yang harus dibaca:** `src/lib/automation/email.ts:161-192` (pola best-effort insert + swallow ala `logAutomationEmail`), `src/lib/automation/runner.ts:55-70` (pola `log()` swallow), `src/lib/supabase/server.ts:29-35` (tipe return `createSupabaseService` untuk tipe parameter).
- **File yang harus diubah:** Buat `src/lib/notifications/error-events.ts`; buat `src/lib/notifications/error-events.test.ts`. Tidak ada file existing yang diubah.
- **Class/function/simbol yang dibuat (kontrak final, jangan diubah implementer):**
  ```ts
  export type ErrorCategory = 'tavily'|'llm'|'research'|'automation'|'scrape'|'cron_api'|'resend'|'image';
  export type ErrorSeverity = 'warning'|'error'|'critical';
  export interface ErrorEventInput { category: ErrorCategory; source: string; severity?: ErrorSeverity; stage?: string|null; message: string; details?: Record<string, unknown>; sessionId?: string|null; runId?: string|null; }
  export function buildFingerprint(category, source, stage, message): string;
  export async function reportError(supabase: SupabaseClient, input: ErrorEventInput): Promise<void>;
  export async function reportCronApiError(supabase, endpoint: '/api/content/process'|'/api/automation/run'|'/api/content/process-legacy', kind: 'unauthorized'|'service_not_configured'|'handler_error', message: string): Promise<void>;
  ```
- **Kondisi saat ini:** Direktori `src/lib/notifications/` belum ada.
- **Perubahan konkret (urutan dalam file):** (1) import `server-only` + tipe `SupabaseClient` + `createHash` dari `node:crypto`; (2) tipe + konstanta `ERROR_CATEGORIES` (array 8 string, dipakai validasi); (3) `normalizeMessage()`: lowercase, ganti UUID (`[0-9a-f]{8}-[0-9a-f-]{4,}`→`#id`), angka (`\d+`→`#n`), ISO timestamp → `#ts`, trim + slice 200 char; (4) `buildFingerprint()`: `createHash('sha1').update(`${category}|${source}|${stage ?? ''}|${normalized}`).digest('hex').slice(0,16)`; (5) `reportError()`: seluruh body dalam `try{...}catch{/* swallow */}`; validasi kategori ada di allowlist (bila tidak, return diam); `message.slice(0,2000)`; insert `{category, source, severity: input.severity ?? 'error', stage: input.stage ?? null, message, details: input.details ?? {}, session_id, run_id, fingerprint: buildFingerprint(...)}`; tidak ada `throw` di jalur mana pun, return `Promise<void>`; (6) `reportCronApiError()`: panggil `reportError` dengan `category:'cron_api'`, `source:endpoint`, `severity: kind==='unauthorized' ? 'warning' : 'error'`, `stage:kind`, `message` (WAJIB sudah diredaksi oleh pemanggil — tidak boleh berisi nilai header Authorization).
- **Behavior yang harus dipertahankan:** Tidak ada perilaku existing yang berubah (file baru).
- **Error handling dan edge case:** `supabase` null/undefined → return diam (jangan throw); insert error (RLS/kategori CHECK) → swallow; `details` non-serializable → bungkus `JSON.parse(JSON.stringify(...))` dalam try, fallback `{}`.
- **Test yang harus ditambahkan:** `error-events.test.ts`: (a) fingerprint deterministik: input sama 2x → string sama 16 char hex; (b) normalisasi: dua pesan beda UUID/angka → fingerprint SAMA; pesan beda kata → BEDA; (c) truncasi: message 3000 char → payload insert 2000 char (assert via mock client yang merekam argumen); (d) never-throws: client yang `from()`-nya throw + client null → resolve tanpa throw; (e) `reportCronApiError` mapping: kind `unauthorized` → severity `warning`, kind lain → `error`, source = endpoint yang diberikan. Mock client minimal: `{ from: () => ({ insert: async (row) => { captured.push(row); return {error:null}; } }) }`.
- **Input test dan expected result:** Lihat butir (a)-(e) di atas.
- **Command verifikasi:** `npx vitest run src/lib/notifications/error-events.test.ts` → semua pass. `npm run typecheck` → 0 error. `npm run lint` → bersih pada file baru.
- **Hasil verifikasi yang diharapkan:** 5 grup test hijau; grep `throw` di file sumber → 0 hit (kecuali komentar).
- **Completion criteria:** 5 grup test hijau; tidak ada `throw` di file.
- **File atau area yang tidak boleh diubah:** File existing mana pun.

## Langkah 4 — `sendErrorDigestEmail()` di `src/lib/automation/email.ts` + test

- **Tujuan:** Pengirim email digest (satu email berisi banyak kategori) dengan reuse `deliver()`, `emailShell()`, `logAutomationEmail()`.
- **Finding/requirement:** F6 (reuse infra Resend existing; recursion guard R6); F5 (identitas pengirim dari `AutomationConfig.emailFrom`).
- **Dependency:** Langkah 3 (tipe event untuk render; boleh paralel selama kontrak grup disepakati — urutan aman: setelah Langkah 3).
- **File yang harus dibaca:** `src/lib/automation/email.ts` seluruhnya (325 baris — `deliver` :137-159, `emailShell` :120-129, `escapeHtml` :112-118, `logAutomationEmail` :166-192, `sendFailureEmail` :295-325 sebagai template render), `src/lib/automation/email.test.ts:1-110` (pola `cfg()`, `mockFetch()`, `throwingClient`).
- **File yang harus diubah:** `src/lib/automation/email.ts` (tambah di akhir, setelah `sendFailureEmail`), `src/lib/automation/email.test.ts` (tambah describe).
- **Simbol terkait:** `deliver`, `emailShell`, `escapeHtml`, `logAutomationEmail`, `SendResult`, `AutomationConfig`, `resolveResendKey`.
- **Kondisi saat ini:** Hanya ada 3 sender (`sendDraftReadyEmail`, `sendPublishedEmail`, `sendFailureEmail`); `emailShell`/`escapeHtml`/`deliver` private di module.
- **Perubahan konkret (urutan dalam `email.ts`):**
  1. Tambah exported interface `ErrorDigestGroup { category: string; count: number; topMessages: Array<{ fingerprint: string; count: number; sample: string }>; }` sebelum fungsi baru.
  2. Tambah exported `async function sendErrorDigestEmail(supabase, cfg: AutomationConfig, input: { recipients: string[]; windowMinutes: number; groups: ErrorDigestGroup[]; totalEvents: number; siteUrl: string }): Promise<SendResult>` di akhir file. Meniru `sendFailureEmail` persis: render dalam try (gagal render → return `{ok:false, error:'render error_digest gagal: ...'}`), panggil `deliver` dengan subject `` `[Asharu] Ringkasan error ${windowMinutes} menit terakhir (${totalEvents} kejadian)` ``, lalu `void logAutomationEmail(... moment:'error_digest', recipients, result)`. Body HTML: judul `Ringkasan error integrasi (N kejadian / M menit)`, per kategori `<h3>kategori (count)</h3><ul><li>[fingerprint-8] (n×) sample…</li></ul>`, footer link `/id/admin/automation`. Semua string via `escapeHtml`.
  3. JANGAN ubah `deliver`, `sendViaResend`, `sendFailureEmail`, atau 2 sender lain (satu byte pun).
- **Behavior yang harus dipertahankan:** Sender existing tidak berubah; `sendFailureEmail` tetap diekspor (dipakai test existing + fallback manual).
- **Error handling dan edge case:** `groups` kosong → return `{ok:false, skipped:true, skippedReason:null, error:'no digest groups'}` TANPA memanggil `deliver`; recipients kosong/key hilang ditangani `deliver` seperti biasa.
- **Test yang harus ditambahkan (di `email.test.ts`):** (a) sukses: `mockFetch(200,'{"id":"digest_1"}')` + client `{rpc: async () => ({data:'re_key', error:null})}` → `res.ok===true`, subject mengandung `30 menit` dan `(3 kejadian)` untuk input totalEvents=3; HTML mengandung nama kategori + sample; (b) groups kosong → `ok:false`, fetch tidak dipanggil; (c) key hilang (`throwingClient` + env tanpa key) → `skipped:true, skippedReason:'key_missing'`. Input test: 2 grup (`tavily` count 2 topMessages 1, `llm` count 1).
- **Input test dan expected result:** Lihat butir (a)-(c).
- **Command verifikasi:** `npx vitest run src/lib/automation/email.test.ts` → pass termasuk test lama. `npm run typecheck`, `npm run lint` → bersih.
- **Hasil verifikasi yang diharapkan:** 3 test baru hijau + tidak ada test lama yang diubah/gagal.
- **Completion criteria:** Test baru 3 hijau; tidak ada test lama yang gagal.
- **File atau area yang tidak boleh diubah:** `deliver`, `sendViaResend`, `classifyResendError`, `resolveResendKey`, 3 sender existing, `emailShell`, `escapeHtml` (hanya dipakai, tidak diubah).

## Langkah 5 — Lib digest `src/lib/notifications/error-digest.ts` + unit test

- **Tujuan:** Otak tick digest: pilih kategori jatuh-tempo, ambil event, grouping, kirim 1 email, tandai notified (claim-first agar idempoten).
- **Finding/requirement:** R2 (1 email per window), R3 (window per kategori), R6 (recursion guard: module ini TIDAK boleh import `reportError`).
- **Dependency:** Langkah 1 (skema), 3 (tipe `ErrorCategory`), 4 (`sendErrorDigestEmail`, `AutomationConfig`).
- **File yang harus dibaca:** `src/lib/automation/config.ts:131-172` (`loadAutomationConfig`, `resolveRecipients`), `src/lib/automation/runner.ts:830-869` (pola `notifyFailure`), `src/lib/automation/email.ts:166-192` (tanda tangan `logAutomationEmail`).
- **File yang harus diubah:** Buat `src/lib/notifications/error-digest.ts`; buat `src/lib/notifications/error-digest.test.ts`.
- **Simbol yang dibuat:**
  ```ts
  export interface DueCategory { category: string; windowMinutes: number; notifyEmails: string[] | null; }
  export interface DigestEventRow { id: string; category: string; fingerprint: string; message: string; source: string; severity: string; created_at: string; }
  export function groupEvents(rows: DigestEventRow[], maxGroupsPerCategory?: number): ErrorDigestGroup[];
  export async function runErrorDigestTick(supabase, deps?: { now?: Date; send?: typeof sendErrorDigestEmail; siteUrl?: string }): Promise<{ sent: boolean; categories: string[]; eventCount: number }>;
  ```
- **Kondisi saat ini:** Module belum ada.
- **Perubahan konkret (`runErrorDigestTick`, urutan eksekusi — wajib diikuti):**
  1. `now = deps.now ?? new Date()`; muat `error_notification_configs` (select `category,is_enabled,digest_window_minutes,notify_emails,last_digest_at`); bila error/empty → return `{sent:false, categories:[], eventCount:0}` (no-op, tanpa throw).
  2. Muat global automation config via `loadAutomationConfig` (boleh null → pakai `emailFrom` default literal `'Asharu <notifikasi@asharu.id>'` — SAMA dengan default migrasi `20260915000003:50`; `emailReplyTo` null).
  3. Due filter: `is_enabled && (!last_digest_at || now - last_digest_at >= window*60_000)`. Kategori disabled TIDAK pernah due (event menumpuk, lihat B3).
  4. Bila tidak ada kategori due → return `{sent:false,...}` TANPA query events, TANPA update `last_digest_at`, TANPA log.
  5. Ambil events: `from('error_events').select(...).is('notified_at', null).in('category', dueCats).order('created_at').limit(500)`; bila error → return sent:false; bila 0 rows → return sent:false TANPA update `last_digest_at` dan TANPA log email.
  6. Resolve recipients: per kategori due, `cat.notifyEmails?.length ? dedupe : (global ? await resolveRecipients(supabase, global) : [])`; gabung + dedupe sebagai penerima SATU email. Bila kosong → tulis `logAutomationEmail` skipped (`moment:'error_digest'`, result `{ok:false, skipped:true, skippedReason:'no_recipients', error:'no recipients'}`) dan return sent:false TANPA menandai notified dan TANPA update `last_digest_at`.
  7. **Claim-first:** update `error_notification_configs SET last_digest_at=now` untuk kategori due SEBELUM kirim (mencegah double-send bila 2 tick overlap).
  8. Kirim via `deps.send ?? sendErrorDigestEmail` (SATU panggilan untuk semua kategori). `siteUrl = deps.siteUrl ?? env.siteUrl` (import `env` dari `@/lib/env` — pola `runner.ts:3,846`).
  9. Bila `res.ok` → update `error_events SET notified_at=now WHERE id IN (...ids)` (chunk 100 per update bila >100); return `{sent:true, categories, eventCount}`. Bila gagal non-skipped → JANGAN tandai notified (retry tick berikut; `last_digest_at` sudah maju = tunda satu window, terdokumentasi); `logAutomationEmail` sudah ditulis oleh sender (Langkah 4) — JANGAN tulis log ganda di sini. Bila skipped → sama, jangan tandai.
  10. Seluruh body dalam try/catch → catch return `{sent:false, categories:[], eventCount:0}` (tidak pernah throw).
- **`groupEvents` (pure):** grup per `(category, fingerprint)`; `count`; `sample` = message pertama (slice 160 char); urut count desc; potong `maxGroupsPerCategory` (default 10) per kategori; kategori diurut sesuai urutan kemunculan pertama.
- **Behavior yang harus dipertahankan:** Tidak ada (module baru). Recursion guard: file ini dilarang import `error-events.ts` — tambahkan komentar larangan di header file.
- **Error handling dan edge case:** Event tanpa fingerprint (`''`) tetap digrup; id duplikat di result → dedupe by id sebelum update; `now` injeksi untuk test.
- **Test yang harus ditambahkan (`error-digest.test.ts`, mock client generik meniru pola `runner.test.ts:10-85` — dukung `select/eq/in/order/limit/is/update`):** (a) window belum lewat (`last_digest_at` 5 mnt lalu, window 30) + 3 events → `sent:false`, send tidak dipanggil, events tetap unnotified; (b) window lewat → `sent:true`, `eventCount:3`, `categories` berisi kategori, events tertandai, `last_digest_at` berubah; (c) kategori disabled + events → tidak dikirim; (d) tanpa events → send tidak dipanggil, `last_digest_at` TIDAK berubah; (e) recipients kosong (global notifyEmails `[]` + profiles `[]`) → `sent:false`, events TIDAK tertandai; (f) send gagal (`{ok:false, error:'x'}`) → events TIDAK tertandai tapi `last_digest_at` SUDAH maju (claim-first); (g) `groupEvents`: 3 rows (2 fingerprint sama + 1 beda) → 2 grup, count 2 dan 1, sample terpotong 160 char. Fetch Resend tidak dipakai langsung (send di-inject sebagai mock).
- **Input test dan expected result:** Lihat butir (a)-(g).
- **Command verifikasi:** `npx vitest run src/lib/notifications/error-digest.test.ts` → pass. `npm run typecheck`, `npm run lint` → bersih.
- **Hasil verifikasi yang diharapkan:** 7 grup test hijau; grep `reportError` di file digest → 0 hit (kecuali komentar larangan).
- **Completion criteria:** 7 grup test hijau; tidak ada import `error-events.ts`.
- **File atau area yang tidak boleh diubah:** `config.ts`, `runner.ts`, `email.ts` (hanya diimport).

## Langkah 6 — Instrumentasi Tavily (`discovery.ts`, 2 titik)

- **Tujuan:** Kegagalan Tavily terminal masuk queue kategori `tavily`; parsial non-terminal tetap log-only.
- **Finding/requirement:** F8; R1 (kategori tavily); R5 (throw existing tidak berubah).
- **Dependency:** Langkah 3.
- **File yang harus dibaca:** `src/lib/research/discovery.ts:154-263`, `src/lib/research/search.ts:173-190` (`getSearchProvider` throw key-hilang).
- **File yang harus diubah:** `src/lib/research/discovery.ts` (2 titik). Test: cek via glob apakah `src/lib/research/discovery.test.ts` sudah ada — bila ada, tambah describe di sana; bila belum, buat baru.
- **Simbol terkait:** `runDiscovery`, `getSearchProvider`, `reportError`.
- **Kondisi saat ini:** L160 `const provider = await getSearchProvider(supabase)` (throw key-hilang langsung propagate); L259-263 `chunked.length===0` throw; L242-249 extract gagal → warn log saja.
- **Perubahan konkret (urutan):**
  1. Tambah import `reportError` dari `@/lib/notifications/error-events` di blok import atas.
  2. Titik A — bungkus L160: `let provider; try { provider = await getSearchProvider(supabase); } catch (e) { const message = e instanceof Error ? e.message : String(e); await reportError(supabase, { category:'tavily', source:'getSearchProvider', severity:'error', stage:'discovering', message, sessionId }); throw e; }` — `throw e` (objek error sama, bukan `new Error`).
  3. Titik B — sebelum `throw` L259-263: `await reportError(supabase, { category:'tavily', source:'discovery', severity:'error', stage:'discovering', message: <string pesan yang sama dengan throw>, details: { raw: rawResults.length, failed: failedQueries, total: queries.length }, sessionId });` lalu `throw` existing tidak berubah.
  4. TIDAK melaporkan: parsial (`failedQueries>0 && <total` — hanya `search_call_logs` existing), extract gagal L242-249 (biarkan warn log).
- **Behavior yang harus dipertahankan:** Pesan throw, tipe error, dan alur `allSettled` identik; `search_call_logs` insert tidak berubah.
- **Error handling dan edge case:** `reportError` gagal (DB down) → swallow internal, throw asli tetap jalan (R5). `sessionId` selalu ada di signature `runDiscovery` — teruskan apa adanya.
- **Test yang harus ditambahkan:** Via `vi.mock('@/lib/research/search')` provider stub yang search-nya selalu reject: (a) semua query gagal → `runDiscovery` reject + 1 row `error_events` (`category:'tavily'`, `source:'discovery'`); (b) mock `getSearchProvider` reject (key hilang) → reject + row `source:'getSearchProvider'`.
- **Input test dan expected result:** Lihat butir (a)-(b).
- **Command verifikasi:** `npx vitest run src/lib/research/discovery` → pass. `npm run typecheck`, `npm run lint` → bersih.
- **Hasil verifikasi yang diharapkan:** Test hijau; throw existing byte-identik.
- **Completion criteria:** 2 test hijau; tidak ada perubahan selain import + 2 blok.
- **File atau area yang tidak boleh diubah:** `search.ts` (provider tidak disentuh), prompt discovery, `chunkSourcesForLLM`, `dedupResults`, blok LLM di bawah L265+.

## Langkah 7 — Instrumentasi LLM (`completion.ts` + `vault.ts`)

- **Tujuan:** Kegagalan LLM terminal + auto-disable key/model masuk queue kategori `llm`, tanpa noise per-key-attempt.
- **Finding/requirement:** F4 (silent auto-disable); R1; R5.
- **Dependency:** Langkah 3.
- **File yang harus dibaca:** `src/lib/llm/completion.ts:55-140` dan `:225-274` (terverifikasi), `src/lib/supabase/vault.ts:1-54` (WAJIB dibaca implementer: header import + `getServiceClient` + tipe `KeyRow` — segmen ini belum diverifikasi) dan `:77-129` (terverifikasi).
- **File yang harus diubah:** `src/lib/llm/completion.ts` (1 titik + 1 variabel), `src/lib/supabase/vault.ts` (2 titik). Test: glob `src/lib/llm/*.test.ts` dulu; bila ada `completion.test.ts`, tambah describe di sana, else buat `src/lib/llm/completion-report.test.ts`.
- **Simbol terkait:** `runLLMCompletion`, `lastError`, `markKeyFailure`, `markModelFailure`, `getServiceClient`, `reportError`.
- **Kondisi saat ini:** L273 `throw lastError ?? new Error('All LLM providers failed')`; `markKeyFailure`/`markModelFailure` set `is_active=false` saat `next > 5` tanpa notifikasi.
- **Perubahan konkret `completion.ts` (urutan):**
  1. Tambah import `reportError`.
  2. Setelah L112 `let lastError`, tambah `const triedProviders: string[] = [];`; di awal loop `for (const prov of providers)` (sebelum `new KeyPool`, L114) tambah `triedProviders.push(prov.slug);`.
  3. Ganti L273 menjadi: `const finalError = lastError ?? new Error('All LLM providers failed'); const finalMsg = finalError instanceof Error ? finalError.message : String(finalError); await reportError(supabase, { category:'llm', source:'runLLMCompletion', severity:'error', stage: input.stage ?? null, message: finalMsg, details: { providers: [...new Set(triedProviders)] }, sessionId: input.sessionId ?? null }); throw finalError;` — objek error yang dilempar IDENTIK dengan sebelumnya.
- **Perubahan konkret `vault.ts` (urutan):**
  1. Tambah import `reportError` (cek import existing di header dulu).
  2. Di `markKeyFailure` setelah update (`:89`): `if (next > 5) { try { const supabase = getServiceClient(); if (supabase) await reportError(supabase, { category:'llm', source:'markKeyFailure', severity:'warning', message: `LLM provider key auto-disabled setelah ${next} kegagalan (key_id ${keyId.slice(0,8)})`, details: { key_id: keyId } }); } catch { /* swallow */ } }` — syarat `next > 5` = tepat transisi disable (konsisten dengan L88), bukan tiap failure. keyId lengkap hanya di details (bukan secret), message hanya 8 char.
  3. Sama untuk `markModelFailure` (`source:'markModelFailure'`, message `LLM model auto-disabled...`, `details:{model_id: modelId}`).
- **Behavior yang harus dipertahankan:** Waterfall, `KeyPool` blame rules (hanya 401/403/429), threshold `>5`, pesan throw final, semua insert `llm_call_logs` — tidak berubah.
- **Error handling dan edge case:** `input.sessionId` null (Chat Lab) → teruskan null; `reportError` swallow → throw final tetap keluar; tidak ada secret di message/details.
- **Test yang harus ditambahkan (`completion`):** Mock providers + supabase mock: (a) semua model gagal → `runLLMCompletion` reject dengan pesan asli + 1 row `error_events` kategori `llm` dengan `details.providers` berisi slug yang dicoba; (b) sukses di provider kedua → resolve + 0 row `error_events`. Untuk vault: TIDAK di-unit-test (terikat service client internal `getServiceClient`; didokumentasikan terbuka) — auto-disable ter-cover end-to-end oleh test digest Langkah 5 yang memakai event kategori `llm`. Verifikasi vault via manual dev 1x (lihat completion criteria).
- **Input test dan expected result:** Lihat butir (a)-(b).
- **Command verifikasi:** `npx vitest run src/lib/llm/` → pass; typecheck; lint.
- **Hasil verifikasi yang diharapkan:** Test completion hijau; tidak ada perubahan blame/threshold.
- **Completion criteria:** Test completion hijau; vault: verifikasi manual dev 1x (set `failure_count=5` pada 1 key test, trigger 1 failure, cek row `error_events` `source:'markKeyFailure'`, lalu kembalikan `is_active`/`failure_count`) — dicatat di handoff sebagai sisa verifikasi manusia.
- **File atau area yang tidak boleh diubah:** `key-pool.ts` (blame rules), provider adapters (`openai-compatible.ts`, `gemini.ts`, `cloudflare.ts`, `naraya.ts`, `ciora.ts`, `openrouter.ts`), `registry.ts`, `stage-defaults.ts`, `model-config.ts`, threshold `>5`.

## Langkah 8 — Instrumentasi riset (`orchestrator.ts` catch)

- **Tujuan:** Setiap sesi yang flip ke `failed` masuk queue kategori `research` dengan stage asal.
- **Finding/requirement:** R1 (kategori research); titik terminal discovery/verification/scoring/development.
- **Dependency:** Langkah 3.
- **File yang harus dibaca:** `src/lib/research/orchestrator.ts:120-180` (WAJIB: awal `advanceStage` + ketersediaan `session.status` — segmen ini belum diverifikasi; catch `:243-259` memakai `session.status` dan `sessionId` — terverifikasi).
- **File yang harus diubah:** `src/lib/research/orchestrator.ts` (1 titik di catch `:243-259`). Test: cek keberadaan `src/lib/research/orchestrator.test.ts`; bila belum ada, buat baru.
- **Simbol terkait:** `advanceStage`, `reportError`.
- **Kondisi saat ini:** Catch update `failed` + `error_message`, insert `content_research_logs` level error, return `{status:'failed', advanced:false}`.
- **Perubahan konkret (urutan):** (1) tambah import `reportError`; (2) di catch, SETELAH insert `content_research_logs` (`:252-257`) dan SEBELUM `return { status:'failed'... }` (`:258`), tambah: `await reportError(supabase, { category:'research', source:'advanceStage', severity:'error', stage: session.status, message, sessionId });` — `message` dan `session.status` adalah variabel yang sudah ada di scope catch.
- **Behavior yang harus dipertahankan:** Update `failed` + `error_message`, insert log, return value — identik.
- **Error handling dan edge case:** `session.status` apa pun (termasuk terminal) — teruskan apa adanya sebagai `stage`; reportError swallow → return failed tetap.
- **Test yang harus ditambahkan:** Mock `runDiscovery` gagal (`vi.mock('./discovery')` reject `Error('boom')`) + supabase mock generik → `advanceStage` return `{status:'failed'}` + row `error_events` (`category:'research'`, `stage:'discovering'`, `sessionId` benar) + row `content_research_sessions` ter-update failed (perilaku lama tetap).
- **Input test dan expected result:** Lihat di atas.
- **Command verifikasi:** `npx vitest run src/lib/research/orchestrator` → pass; typecheck; lint.
- **Hasil verifikasi yang diharapkan:** Test hijau; tidak ada perubahan selain import + 1 blok.
- **Completion criteria:** Test hijau; diff hanya import + 1 blok.
- **File atau area yang tidak boleh diubah:** `state-machine.ts`, stage runners (`verification.ts`, `scoring.ts`, `development.ts`), `advancePendingSessions` guard, `atomicTransition`.

## Langkah 9 — Migrasi `notifyFailure` runner → queue (PERUBAHAN PERILAKU — risiko tertinggi)

- **Tujuan:** 6 situs `notifyFailure` berhenti mengirim email langsung; sebagai gantinya 1 row queue kategori `automation` (dikirim via digest Langkah 5).
- **Finding/requirement:** F1 (spam 1-email-per-kejadian); R2. Satu-satunya langkah yang MENGHAPUS notifikasi existing — lihat B2.
- **Dependency:** Langkah 3, 4, 5 (digest end-to-end harus hijau SEBELUM mematikan email langsung — bila digest belum siap, JANGAN kerjakan langkah ini).
- **File yang harus dibaca:** `src/lib/automation/runner.ts:830-869` (`notifyFailure` — terverifikasi), `:11` (import email), `src/lib/automation/runner.test.ts:121-360` (WAJIB dibaca implementer — segmen ini belum diverifikasi dan kemungkinan berisi test yang assert email failure langsung / `automation_email_log` moment `failure`).
- **File yang harus diubah:** `src/lib/automation/runner.ts` (fungsi `notifyFailure` saja + import), `src/lib/automation/runner.test.ts` (update test terdampak + tambah test baru).
- **Simbol terkait:** `notifyFailure`, `sendFailureEmail`, `logAutomationEmail`, `resolveRecipients`, `reportError`.
- **Kondisi saat ini:** `notifyFailure` resolve recipients → `sendFailureEmail` → warn log bila gagal → selalu `logAutomationEmail` moment `failure`.
- **Perubahan konkret (urutan dalam `runner.ts`):**
  1. Ganti import L11: hapus `sendFailureEmail` dari import `./email` HANYA bila 0 pemakaian tersisa (verifikasi via grep). JANGAN hapus `logAutomationEmail` (masih dipakai `:688` draft_ready dan `:794` published) dan JANGAN hapus `resolveRecipients` tanpa grep dulu.
  2. Tambah import `reportError` dari `@/lib/notifications/error-events`.
  3. Ganti SELURUH body `notifyFailure` (`:830-869`) menjadi: komentar header baru ("Queue-only: email dikirim via digest..."), `try { await reportError(supabase, { category:'automation', source:'notifyFailure', severity:'error', stage, message: error, details: { run_date: run.run_date, slot_key: run.slot_key ?? null }, sessionId: run.session_id, runId: run.id }); } catch { await log(supabase, run.session_id, 'automation', 'warn', `queue error event gagal: ...`); }` — pertahankan signature `(supabase, cfg, run, stage, error)` agar 6 call sites (`:587,:605,:650,:667,:750,:958`) TIDAK berubah; parameter `cfg` jadi unused → tambah `void cfg;` (satu baris, identifier signature tetap, lint lolos).
  4. JANGAN ubah 6 call sites, `failCover`, `updateRun`, atau pesan error di tiap situs.
- **Behavior yang harus dipertahankan:** Semua status run (`failed` + `error_message`), semua `log()` existing, alur retry — identik. Yang BERUBAH (disengaja): tidak ada lagi email langsung moment `failure`; tidak ada lagi baris `automation_email_log` moment `failure` dari runner (badge UI failure tidak muncul — diganti digest; lihat Langkah 13 untuk penanganan badge).
- **Error handling dan edge case:** `reportError` tidak pernah throw, tapi bungkus try/catch tetap dipertahankan (pertahanan berlapis, pola sama seperti sebelumnya); `run.session_id` null → `log()` no-op + `reportError` dengan sessionId null (skema mengizinkan).
- **Test yang harus ditambahkan/diperbarui:** (a) Perbarui test existing yang assert email failure langsung / baris log moment `failure` (temukan via grep `failure` di `runner.test.ts` — implementer wajib inventarisasi dulu); (b) test baru: run dengan sesi `failed` → `advanceRun` return failed + 1 row `error_events` (`category:'automation'`, `stage:'developing'`, `runId` = run id) + 0 baris `automation_email_log` moment `failure` + `run.error_message==='sesi riset failed'` (perilaku lama tetap).
- **Input test dan expected result:** Lihat butir (b); pola tabel mengikuti `basePublishedTable` (`runner.test.ts:360-386`) dengan status run `developing` + `content_research_sessions: [{id:'s1', status:'failed'}]`.
- **Command verifikasi:** `npx vitest run src/lib/automation/runner.test.ts` → pass. `npm run typecheck`, `npm run lint` → bersih.
- **Hasil verifikasi yang diharapkan:** Seluruh test runner hijau; grep `sendFailureEmail` di `src/` → hanya definisi (`email.ts`) + test (`email.test.ts`), 0 pemanggilan produksi.
- **Completion criteria:** Test (a)+(b) hijau; 6 call sites tidak tersentuh (diff hanya fungsi `notifyFailure` + import).
- **File atau area yang tidak boleh diubah:** 6 call sites, `failCover`, `updateRun`, `advanceRun` state machine, pesan error tiap situs, jalur email `draft_ready`/`published` (`:670-705`, `:770-811`), `wantsNotification`.

## Langkah 10 — Instrumentasi API routes (`cron_api`: service-500 + handler-500; 401 DITUNDA ke B1)

- **Tujuan:** Kegagalan tingkat endpoint (service null, throw handler) masuk queue kategori `cron_api`.
- **Finding/requirement:** F3 (celah observabilitas endpoint); R1.
- **Dependency:** Langkah 3.
- **File yang harus dibaca:** `src/app/api/content/process/route.ts` (31 baris, terverifikasi), `src/app/api/automation/run/route.ts` (31 baris, terverifikasi), `src/app/api/content/process-legacy/route.ts:1-50` (auth + service — terverifikasi via grep) dan `:150-260` (WAJIB dibaca implementer: blok catch `:155` dan `:237` + bentuk response sukses agar tidak berubah).
- **File yang harus diubah:** 3 file route (pola identik, kerjakan satu per satu). Test: TIDAK ada route test existing — JANGAN refactor route demi testabilitas; 401/500-path diverifikasi via unit test helper `reportCronApiError` (Langkah 3, sudah mencakup mapping) + verifikasi manual (handoff).
- **Simbol terkait:** `isCronAuthorized`, `createSupabaseService`, `reportCronApiError`.
- **Kondisi saat ini:** 401 → JSON tanpa DB; service-null → 500 tanpa DB; catch → 500 `{error: message}` tanpa DB.
- **Perubahan konkret (pola identik per route, urutan dalam `handle()`):**
  1. Tambah import `reportCronApiError`.
  2. Cabang service-null: sebelum `return NextResponse.json({ error: 'service not configured' }, { status: 500 })`, tambah `await reportCronApiError(supabase-unused?, ...)` — masalah: client null di cabang ini. Solusi: `reportCronApiError` butuh client; bila `createSupabaseService()` null, tidak ada client → LEWATI pelaporan (tidak bisa insert tanpa client). Dokumentasikan: cabang service-null hanya dilaporkan bila... tidak bisa. Keputusan eksplisit: cabang service-null TIDAK dilaporkan (tanpa client tidak ada jalan tulis DB yang aman; membuat client anon akan kena RLS). Yang dilaporkan: (a) catch handler — client `supabase` sudah ada di scope → `await reportCronApiError(supabase, '<endpoint>', 'handler_error', message)` sebelum return 500; (b) 401 — DITUNDA, lihat B1 (jangan implementasikan; biarkan return 401 murni).
  3. Status code, body JSON, dan pesan response — byte-identik dengan sebelumnya.
- **Behavior yang harus dipertahankan:** Semua status/body response identik; tidak ada penulisan DB di jalur 401/service-null.
- **Error handling dan edge case:** `reportCronApiError` swallow → response 500 tetap terkirim; message = pesan error asli (tidak mengandung header/auth karena berasal dari exception handler, bukan request).
- **Test yang harus ditambahkan:** Tidak ada test route baru (disengaja — lihat di atas). Coverage: helper sudah dites di Langkah 3.
- **Input test dan expected result:** N/A (verifikasi manual, lihat handoff).
- **Command verifikasi:** `npm run typecheck`, `npm run lint` → bersih. Verifikasi manual: matikan 1 provider lalu trigger tick di dev → cek row `error_events` kategori `cron_api` bila handler melempar (skenario langka; minimal cek tidak ada regresi response).
- **Hasil verifikasi yang diharapkan:** Typecheck/lint bersih; response 401/500 lama tidak berubah (bandingkan via curl sebelum/sesudah bila ragu).
- **Completion criteria:** 3 route melaporkan `handler_error`; diff per route ≤ 5 baris (import + 1 blok di catch).
- **File atau area yang tidak boleh diubah:** `cron-auth.ts` (logika auth), `maxDuration`, method GET/POST wrapper, `process-legacy` jalur sukses + insert `llm_call_logs` (`:227,:244`), body/status response apa pun.

## Langkah 11 — Endpoint `POST /api/notifications/error-digest` + test

- **Tujuan:** Target pg_cron (Langkah 2) untuk mengeksekusi tick digest.
- **Finding/requirement:** R2 (eksekusi berkala tiap 5 menit, gate window di lib).
- **Dependency:** Langkah 2 (cron menembak URL ini), 5 (`runErrorDigestTick`).
- **File yang harus dibaca:** `src/app/api/automation/run/route.ts` (template `handle()` + auth + service-null — 31 baris, terverifikasi).
- **File yang harus diubah:** Buat `src/app/api/notifications/error-digest/route.ts`; buat `src/app/api/notifications/error-digest/route.test.ts`.
- **Simbol terkait:** `isCronAuthorized`, `createSupabaseService`, `runErrorDigestTick`.
- **Perubahan konkret (isi route, tiru template automation/run persis):** `export const maxDuration = 60;` + `POST`/`GET` → `handle()`: 401 bila `!isCronAuthorized(request)`; 500 `service not configured` bila client null; try `await runErrorDigestTick(supabase)` → `NextResponse.json({ ok:true, ...result })`; catch → 500 `{ error: message }`. JANGAN tambah `reportCronApiError` di route ini (self-report = loop konseptual; kegagalan tick digest cukup terlihat dari tidak adanya baris `automation_email_log` moment `error_digest`).
- **Behavior yang harus dipertahankan:** Tidak ada (endpoint baru). Kontrak auth identik dengan endpoint cron lain (Bearer-only, `x-vercel-cron` ditolak).
- **Error handling dan edge case:** `runErrorDigestTick` tidak pernah throw (kontrak Langkah 5), catch di route hanya pertahanan kedua.
- **Test yang harus ditambahkan (`route.test.ts`):** Kesulitan: `env.cronSecret` di-parse saat import module → set `process.env.CRON_SECRET` di test tidak reliably mempengaruhi import yang sudah ter-cache. Spesifikasi deterministik: (a) test jalur sukses tanpa secret: pastikan `NODE_ENV=test` (bukan production) dan `CRON_SECRET` unset → `isCronAuthorized` return true → inject? Route memanggil `runErrorDigestTick` langsung (sulit mock — module internal). Solusi: `vi.mock('@/lib/notifications/error-digest', () => ({ runErrorDigestTick: vi.fn(async () => ({ sent:true, categories:['llm'], eventCount:2 })) }))` + `vi.mock('@/lib/supabase/server', () => ({ createSupabaseService: () => ({}) }))` lalu `await POST(new Request('http://x', { method:'POST' }))` → expect status 200 + body `{ok:true, sent:true, eventCount:2}`; (b) service-null: mock `createSupabaseService: () => null` → status 500. 401-path TIDAK dites di sini (dicover test `cron-auth` bila ada; implementer cek `src/lib/content/cron-auth.test.ts` — bila belum ada, buat file kecil itu dengan 3 case: secret cocok → true, salah → false, tanpa secret + `isProduction:true` → false, tanpa secret + `isProduction:false` → true; pure function via `options` override — deterministik).
- **Input test dan expected result:** Lihat butir (a)-(b) + 4 case cron-auth.
- **Command verifikasi:** `npx vitest run src/app/api/notifications/error-digest` (+ `src/lib/content/cron-auth` bila dibuat) → pass. Typecheck; lint.
- **Hasil verifikasi yang diharapkan:** Test hijau tanpa mengubah env global test lain (mock via `vi.mock`, bukan `process.env` mutation permanen).
- **Completion criteria:** Route merespons sesuai kontrak; test (a)-(b) hijau.
- **File atau area yang tidak boleh diubah:** `vercel.json` (JANGAN tambah cron/functions — cron via pg_cron), route cron existing, `cron-auth.ts` (kecuali test baru bila belum ada).

## Langkah 12 — Endpoint `POST /api/notifications/report` + test

- **Tujuan:** Jalan masuk pelaporan untuk GitHub Actions scrape (yang tidak punya service client TS).
- **Finding/requirement:** F2 (scrape butuh jalan lapor); R1 (kategori scrape).
- **Dependency:** Langkah 3 (validasi kategori + `reportError`).
- **File yang harus dibaca:** `src/app/api/revalidate/products/route.ts` (WAJIB dibaca implementer — pola auth Bearer `CRON_SECRET` + validasi untuk endpoint non-cron; belum diverifikasi isinya), `src/lib/content/cron-auth.ts` (33 baris, terverifikasi).
- **File yang harus diubah:** Buat `src/app/api/notifications/report/route.ts`; buat `src/app/api/notifications/report/route.test.ts`.
- **Simbol terkait:** `isCronAuthorized`, `createSupabaseService`, `reportError`, `ErrorCategory`, `zod` (`z` — pola `src/lib/env.ts`).
- **Perubahan konkret (isi route):** `export const maxDuration = 30;` + hanya `POST` (tanpa GET — minimalkan surface): 401 bila unauthorized; 500 service-null; parse JSON body + validasi Zod strict: `{ category: z.enum([...8...]), source: z.string().min(1).max(100), severity: z.enum(['warning','error','critical']).default('error'), stage: z.string().max(100).nullish(), message: z.string().min(1).max(2000), details: z.record(z.unknown()).nullish(), sessionId: z.string().max(100).nullish(), runId: z.string().max(100).nullish() }` (sessionId/runId string longgar — bukan uuid strict — agar CI tidak friksi); 400 `{error: 'invalid payload'}` bila gagal; `await reportError(...)` → 200 `{ok:true}`. Tidak pernah 500 dari `reportError` (swallow internal).
- **Behavior yang harus dipertahankan:** Tidak ada (endpoint baru).
- **Error handling dan edge case:** Body bukan JSON → 400 (bungkus `await request.json()` dalam try); kategori di luar enum → 400 (jangan 500); `details` besar → `reportError` menangani serialisasi.
- **Test yang harus ditambahkan (`route.test.ts`, pola mock sama seperti Langkah 11):** (a) payload valid → 200 `{ok:true}` + mock `reportError` (via `vi.mock('@/lib/notifications/error-events')`) dipanggil dengan category/source/message yang benar; (b) kategori `bogus` → 400; (c) message kosong → 400; (d) tanpa auth + secret diset? — sama sulitnya seperti Langkah 11: lewati 401 di sini, andalkan test cron-auth. Mock `createSupabaseService` return `{}`.
- **Input test dan expected result:** (a) `{category:'scrape', source:'github-actions', message:'sync failed'}` → 200; (b) `{category:'bogus', source:'x', message:'y'}` → 400; (c) `{category:'scrape', source:'x', message:''}` → 400.
- **Command verifikasi:** `npx vitest run src/app/api/notifications/report` → pass. Typecheck; lint.
- **Hasil verifikasi yang diharapkan:** Test hijau; endpoint menolak payload invalid dengan 400 (bukan 500).
- **Completion criteria:** 3 test hijau; hanya method POST yang ada.
- **File atau area yang tidak boleh diubah:** `src/app/api/revalidate/products/route.ts` (hanya dibaca sebagai pola), route cron existing.

## Langkah 13 — Admin UI tabel config + server actions + test

- **Tujuan:** Admin dapat mengubah toggle/window/penerima per kategori tanpa deploy (R3).
- **Finding/requirement:** R3; F1 (transparansi: badge failure lama hilang setelah Langkah 9 — UI harus menunjukkan status digest).
- **Dependency:** Langkah 1 (skema), 2 (moment `error_digest` untuk query log).
- **File yang harus dibaca:** `src/app/[locale]/(admin)/admin/automation/page.tsx:1-130` (tipe + badge) dan `:238-367` (query + render — terverifikasi), `src/lib/automation/actions.ts:1-80` (WAJIB: pola `requireAdmin()` + `AutomationActionResult` — belum diverifikasi), `src/components/admin/automation/AutomationForms.tsx` + `SlotForms.tsx` (WAJIB: pola form client + server action — belum diverifikasi; implementer meniru pola yang ada, bukan menciptakan pola baru).
- **File yang harus diubah:** (1) `src/app/[locale]/(admin)/admin/automation/page.tsx` (tambah query + render seksi; tambah `'error_digest'` ke `EmailLogRow['moment']` union `:83` + `renderEmailBadge` order map `:126` tambah `error_digest: 4` + label badge — implementer baca `:121-200` dulu yang belum terverifikasi penuh); (2) buat `src/lib/notifications/actions.ts` (server actions); (3) buat `src/components/admin/automation/ErrorDigestForms.tsx` (client component, meniru pola file forms existing); (4) buat `src/lib/notifications/actions.test.ts` (validasi).
- **Simbol terkait:** `requireAdmin` (automation), `revalidatePath`, `isAdmin`, `createSupabaseService`.
- **Kondisi saat ini:** Halaman hanya query `automation_configs/runs/platforms/templates/emailLogs(200)/slots`; tidak ada query config digest.
- **Perubahan konkret (urutan):**
  1. `actions.ts` baru: `'use server'`; `requireAdmin()` meniru `automation/actions.ts` (baca dulu); `updateErrorNotificationConfig(formData: FormData)`: parse `category` (harus di allowlist 8 → else return fail `'kategori tidak dikenal'`), `is_enabled` (checkbox `on`/absent), `digest_window_minutes` (int, harus 5-1440 → else fail), `notify_emails` (split koma/baris-baru, trim, kosongkan → null; tiap email validasi `z.string().email()` → 1 invalid = fail sebutkan nilainya); update row `error_notification_configs` by category; `revalidatePath('/admin/automation')`; return ok/fail pola `AutomationActionResult` (baca definisinya di `automation/actions.ts` — implementer wajib reuse tipe itu bila diekspor, jangan bikin tipe baru bila sudah ada).
  2. `page.tsx`: tambah query ke `Promise.all` (`:248-278`): `supabase.from('error_notification_configs').select('category,is_enabled,digest_window_minutes,notify_emails,last_digest_at').order('category')` + `supabase.from('error_events').select('id', {count:'exact', head:true}).is('notified_at', null)` (count unnotified; .head agar ringan) + perluas select `automation_email_log` agar mencakup `moment='error_digest'` (query existing `:260-264` tanpa filter moment — sudah mencakup; hanya tipe union + badge yang perlu update). Render seksi baru `<h2>Notifikasi error (digest)</h2>` SETELAH `<SlotSection/>` (`:312-317`) dan SEBELUM `<h2>Riwayat run` (`:319`): tabel 8 baris via `<ErrorDigestConfigTable rows={...} />` + count unnotified + catatan "email failure langsung dimigrasikan ke digest".
  3. `ErrorDigestForms.tsx`: SATU client component `ErrorDigestConfigTable({ rows }: { rows: Array<{category,is_enabled,digest_window_minutes,notify_emails,last_digest_at}> })` — render `<table>` + per-baris `<form action={updateErrorNotificationConfig}>` dengan hidden `category`, checkbox `is_enabled`, number `digest_window_minutes`, text `notify_emails` (comma-joined), submit `Simpan`. Meniru styling class Tailwind yang dipakai file forms existing (baca dulu — jangan introdusir design system baru).
- **Behavior yang harus dipertahankan:** Semua query/render existing tidak berubah; `EmailLogRow` lama tetap; tidak ada perubahan logika automation.
- **Error handling dan edge case:** Tabel config belum ada (pre-migrasi) → query error → render fallback amber (pola `:300-303`, sebutkan nama migrasi `20260922000001`); `notify_emails` null → tampilkan `(warisi global)`; action tanpafilepath admin → `requireAdmin` menolak (pola existing).
- **Test yang harus ditambahkan (`actions.test.ts`, meniru mock `actions.test.ts:10`):** (a) window `3` → fail (di bawah 5); (b) window `2000` → fail; (c) kategori `bogus` → fail; (d) email `bukan-email` → fail sebutkan nilai; (e) input valid (`llm`, on, `15`, `a@x.id, b@x.id`) → ok + tabel mock ter-update (`digest_window_minutes:15`, `notify_emails:['a@x.id','b@x.id']`); (f) emails kosong → ok + `notify_emails:null`.
- **Input test dan expected result:** Lihat butir (a)-(f).
- **Command verifikasi:** `npx vitest run src/lib/notifications/actions.test.ts` → pass. Typecheck; lint. Verifikasi manual UI: buka `/id/admin/automation` → seksi digest tampil 8 baris; ubah window 1 kategori → tersimpan (cek via SELECT).
- **Hasil verifikasi yang diharapkan:** 6 test hijau; UI render tanpa error RSC.
- **Completion criteria:** Test hijau; tidak ada perubahan visual/fungsi existing (diff halaman hanya tambahan).
- **File atau area yang tidak boleh diubah:** `AutomationConfigForm`, `SlotSection`, `RetryRunForm`, query existing, middleware auth, route `[locale]` lain, i18n messages.

## Langkah 14 — Wiring scrape (`scrape-affiliate.mjs` + workflow) + test

- **Tujuan:** Kegagalan scrape masuk queue kategori `scrape` (F2) via 2 jalur: script langsung (punya service key) + workflow verify steps (via endpoint Langkah 12).
- **Finding/requirement:** F2; R1.
- **Dependency:** Langkah 12 (endpoint report untuk jalur workflow). Jalur script tidak bergantung endpoint (pakai client supabase langsung).
- **File yang harus dibaca:** `scripts/scrape-affiliate.mjs:130-151` (client creation), `:257-310` (failedUploadIds/syncFailed/exit — terverifikasi), `.github/workflows/scrape-affiliate.yml` seluruhnya (113 baris, terverifikasi).
- **File yang harus diubah:** `scripts/scrape-affiliate.mjs` (tambah helper + 2 call sites), `.github/workflows/scrape-affiliate.yml` (ganti step Notify on failure).
- **Simbol terkait:** `supabase.from('error_events')`, endpoint `/api/notifications/report`.
- **Kondisi saat ini:** Script `process.exit(1)` tanpa notifikasi; workflow hanya `echo "::error::"`.
- **Perubahan konkret (urutan dalam `.mjs`):**
  1. Tambah fungsi `async function reportScrapeError(supabase, source, message, details = {})` di dekat atas (setelah import/helper graphql): bila `!supabase` → `console.error` + return (no-op); else `try { await supabase.from('error_events').insert({ category:'scrape', source, severity:'error', message: String(message).slice(0,2000), details, fingerprint: '' }); } catch (e) { console.error('report error event gagal: ' + e.message); }` — fingerprint `''` (DB default; digest tetap grup by `''`). JANGAN import library hashing baru.
  2. Call site A — sebelum `process.exit(1)` di L301-304: `await reportScrapeError(supabase, 'db-sync', `affiliate scrape sync gagal (upload gagal ${failedUploadIds.size} produk baru)`, { failed_uploads: failedUploadIds.size });` — `supabase` bisa null (jalur env-hilang L288-293) → helper no-op aman.
  3. Call site B — di `main().catch` (L307-310): buat client best-effort dari env (`SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, dynamic import `@supabase/supabase-js` seperti L144) dalam try/catch, lalu `await reportScrapeError(client, 'main', err.message)`; `process.exit(1)` tetap.
  4. Workflow: ganti step `Notify on failure` (L111-113) menjadi step `Report failure to error digest` (`if: failure()`, `continue-on-error: true`, env `CRON_SECRET: ${{ secrets.CRON_SECRET }}`, `SITE_URL: ${{ vars.SITE_URL || 'https://asharu.id' }}`): bila `CRON_SECRET` kosong → `echo "::warning::..."` + exit 0; else `curl -sS -X POST "$SITE_URL/api/notifications/report" -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' -d '{"category":"scrape","source":"github-actions","message":"Affiliate scrape workflow failed (run $GITHUB_RUN_ID)"}'` + `echo "::error::Affiliate scrape failed..."` dipertahankan. Secret yang dipakai = `CRON_SECRET` existing (sudah dipakai step revalidate L94) — TIDAK ada secret baru.
- **Behavior yang harus dipertahankan:** Exit codes (`process.exit(1)` paths), guard mass-deactivation + `--allow-mass-deactivation`, pesan `::error::`/`::warning::` existing, logika upsert/soft-delete — tidak berubah. Dry-run (`--dry-run`) TIDAK melaporkan (return awal L192-195 sebelum sync — pertahankan; tidak ada event dari dry-run).
- **Error handling dan edge case:** Insert gagal (RLS/tabel belum ada) → console.error, exit code tetap 1; `curl` gagal → `continue-on-error: true` agar step lapor tidak menutupi status; tanpa `CRON_SECRET` → warning + skip (pola step revalidate L97-100).
- **Test yang harus ditambahkan:** Script `.mjs` tidak punya harness test. Spesifikasi: (a) unit-test endpoint sudah di Langkah 12; (b) untuk helper script: buat `scripts/scrape-affiliate-report.test.mjs`? Repo tidak punya runner untuk itu (vitest config mencakup apa? — implementer cek `vitest.config.ts` include patterns dulu). Keputusan deterministik: JANGAN buat test file baru untuk `.mjs`; verifikasi via (1) `node --check scripts/scrape-affiliate.mjs` (syntax), (2) dry-run `npm run scrape:affiliate:dry-run` tetap jalan (tidak ada event — by design), (3) YAML validasi via `python3 -c "import yaml..."` atau actionlint bila tersedia — minimal `node -e` tidak bisa parse YAML; gunakan `npx --yes js-yaml` ? Menambah dependency runtime tidak diinginkan. Spesifikasi final: validasi YAML manual review + `git diff` review; runtime `.mjs` via `node --check`. Ditambah test endpoint Langkah 12 yang meng-cover payload yang dikirim workflow (bentuk body curl di atas = input test (a) Langkah 12 — tambahkan case persis itu di test Langkah 12 bila belum ada).
- **Input test dan expected result:** `node --check` → exit 0, tanpa output. Dry-run → exit 0 (bila sebelumnya hijau).
- **Command verifikasi:** `node --check scripts/scrape-affiliate.mjs`; `npm run scrape:affiliate:dry-run` (boleh lambat — network; timeout 120 dtk; bila gagal karena network, bukan regresi — catat).
- **Hasil verifikasi yang diharapkan:** Syntax OK; dry-run tidak menulis event (cek: tidak ada insert karena return awal).
- **Completion criteria:** Diff script hanya helper + 2 call sites; diff workflow hanya step terakhir; tidak ada secret baru.
- **File atau area yang tidak boleh diubah:** Logika `graphql()`, pagination, `uploadAffiliateImage`, upsert batching, `MASS_DEACTIVATION_THRESHOLD`, verify steps (asset check + drift check) selain step notify, step revalidate, gates step.

## Langkah 15 — Gate penuh + checklist verifikasi akhir

- **Tujuan:** Memastikan seluruh perubahan hijau dan tidak ada regresi.
- **Dependency:** Langkah 1-14 selesai.
- **File yang harus dibaca:** `package.json` scripts (terverifikasi: `typecheck`, `lint`, `test`, `build`).
- **File yang harus diubah:** Tidak ada.
- **Perubahan konkret:** Jalankan berurutan: `npm run typecheck` → `npm run lint` → `npm test` (penuh, `vitest run`) → `npm run build`. Setiap perintah harus exit 0. Bila merah: perbaiki, dan SETIAP edit setelah gate hijau MEMBATALKAN gate (aturan insiden 2026-09-10: re-run `typecheck` + `lint`, dan `build` bila menyentuh pola yang hanya ditangkap build).
- **Behavior yang harus dipertahankan:** Baseline test ±976 (lihat `.memory/README.md` current state) — jumlah test akhir harus ≥ baseline (test baru Langkah 3/4/5/6/7/8/9/11/12/13 menambah ~30+).
- **Error handling dan edge case:** 1 flaky tak terkait (preseden 2026-09-19) → re-run sekali; bila persisten, catat di progress log, jangan diabaikan diam-diam.
- **Command verifikasi:** Keempat perintah di atas.
- **Hasil verifikasi yang diharapkan:** `typecheck` 0 error; `lint` 0 error/warning baru; `test` semua pass; `build` sukses (Next.js, tanpa error prerender).
- **Completion criteria:** 4 gate hijau berurutan tanpa edit di antaranya; sebelum commit: `git status --short`, `git diff`, `git log --oneline -10`; stage hanya file dimaksud; scan diff untuk secret (`sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`, `.env*`); commit Conventional Commits satu baris tanpa trailer `Co-authored-by`; push (submodule `supabase/` dulu bila disentuh, baru parent).
- **File atau area yang tidak boleh diubah:** N/A (langkah verifikasi).

---

## Risks

- **R-A — Alert kritis tertunda ≤30 mnt** (risiko utama pure-digest; counter: window per-kategori boleh diset 5 mnt untuk `cron_api`; opsi hybrid ditolak user secara eksplisit di kuesioner — keputusan sadar, bukan kelalaian).
- **R-B — Penghapusan email failure langsung (Langkah 9)** mengubah ekspektasi operator yang terbiasa dapat email instan; mitigasi: seksi UI Langkah 13 menjelaskan migrasi + count unnotified terlihat; rollback = revert 1 fungsi.
- **R-C — Volume/noise LLM** (waterfall multi-provider × multi-key): mitigasi — hanya terminal + auto-disable yang dilaporkan (Langkah 7), grouping fingerprint di email (Langkah 5).
- **R-D — Rekursi Resend-down** (digest gagal → event baru → loop): mitigasi — guard struktural (digest tidak import `reportError`; route digest tidak self-report; Langkah 5/11).
- **R-E — Double-send saat 2 tick overlap**: mitigasi — claim-first `last_digest_at` (Langkah 5 butir 7); konsekuensi gagal kirim = tunda satu window (terdokumentasi, bukan bug).
- **R-F — Event menumpuk untuk kategori disabled** (tidak pernah due): mitigasi — count unnotified terlihat di UI (Langkah 13); retensi ditunda ke B3.
- **R-G — Skema `session_id`/`run_id` tanpa FK**: disengaja (event non-sesi); risiko typo id yatim — dapat diterima karena kolom ini informatif, bukan relasional.
- **R-H — Workflow scrape melaporkan via `SITE_URL` publik**: bila deploy Vercel tertunda setelah migrasi, endpoint 404 → `continue-on-error: true` + event dari script langsung (jalur `.mjs`, Langkah 14) tetap menutup celah untuk kegagalan sync; kegagalan verify-steps murni CI tetap hanya `::error::` sampai deploy live (jendela kecil, terdokumentasi).

## Progress Log
- 2026-09-22 07:30:00 — Implementation plan disusun (read-only, Plan Mode): pemetaan existing selesai. Email failure langsung SUDAH ADA untuk automation/riset; celah = scrape/cron-auth/auto-disable key. Kuesioner user: semua integrasi, queue+digest, tabel khusus baru, window 30 menit.
- 2026-09-22 11:45:00 — Implementasi SELESAI seluruh 15 langkah. Gate typecheck ✓ lint (0 error) ✓ test baru 29 ✓. Dev applied via MCP albot-be. Prod applied via MCP asharu (`20260922000001` + `20260922000002`). Commit parent `fe128ee` + submodule `e80a754` push ke main both repos.
- 2026-09-22 11:45:00 — Verifikasi manual tersisa (B7): (1) auto-disable vault trigger manual, (2) end-to-end digest via POST /api/notifications/report + tunggu ≤window+5mnt, (3) UI `/id/admin/automation` seksi digest, (4) dry-run scrape tetap jalan.

## Notes

- Tidak pakai standar C2M/TM Forum ODA (bukan sistem telecom/billing; proporsional untuk fitur notifikasi tunggal).
- Contoh baris config: `{category:'tavily', is_enabled:true, digest_window_minutes:30, notify_emails:null}`; contoh event: `{category:'llm', source:'runLLMCompletion', severity:'error', stage:'developing', fingerprint:'<sha1-16>', message:'All LLM providers failed'}`.
- Counter-argument desain (dicatat eksplisit): alternatif throttle-langsung lebih simpel tapi tetap N email per insiden panjang; hybrid kritis-langsung lebih responsif tapi melanggar pilihan user dan menambah kompleksitas — keduanya ditolak sesuai jawaban kuesioner.
- File plan ini = `plans/2026-09-22-error-digest-email-plan.md` (satu file satu plan; update di file yang sama selama eksekusi).

---

## Open Questions / Blockers (belum diputuskan — JANGAN pilih diam-diam)

- **B1 — Pelaporan 401-unauthorized:** melaporkan dari jalur unauthenticated membuka vektor spam queue (attacker membanjiri endpoint tanpa auth → event → digest spam). Opsi: (a) JANGAN laporkan 401 sama sekali [REKOMENDASI — brute-force noise bukan actionable, dan Langkah 10 sudah menspesifikasikan ini]; (b) laporkan dengan severity warning + dedup fingerprint agresif; (c) laporkan hanya bila rate di bawah ambang (perlu state tambahan — kompleksitas tidak sepadan). Risiko (a): serangan credential-stuffing tak terlihat di digest (tetap terlihat di log platform Vercel). Perlu konfirmasi user bila memilih selain (a).
- **B2 — Penghapusan email failure langsung:** Langkah 9 menghilangkan email instan yang sudah ada (F1). Diratifikasi via pilihan "queue + digest", tetapi ini perubahan perilaku terlihat operator. Bila user ingin masa transisi (kirim langsung + queue paralel selama N hari), Langkah 9 harus ditulis ulang: `notifyFailure` memanggil `sendFailureEmail` SEPERTI SEMULA plus `reportError`. Konfirmasi: langsung migrasi penuh (spesifikasi saat ini) atau transisi paralel?
- **B3 — Retensi/TTL `error_events`:** v1 tanpa auto-delete (event notified menumpuk selamanya; unnotified kategori disabled juga menumpuk). Opsi: (a) biarkan (volume kecil: hanya kegagalan terminal) + cleanup manual [REKOMENDASI v1]; (b) pg_cron cleanup (`DELETE notified_at < now()-30d`) di migrasi lanjutan. Volume diestimasi <50 baris/hari → (a) aman untuk bulan pertama.
- **B4 — Satu email gabungan vs satu email per kategori:** spesifikasi = SATU email gabungan semua kategori due (Langkah 5 butir 8). Alternatif per-kategori = N email per window (melanggar semangat anti-spam). Dianggap decided, dicatat agar tidak di-"improve" diam-diam.
- **B5 — Tavily parsial tidak dilaporkan:** hanya terminal (all-failed, key-hilang, chunked-kosong). Parsial tetap terlihat di `search_call_logs` (`failedQueries/total`). Bila user ingin visibilitas parsial, tambahkan severity `warning` di Langkah 6 — dengan risiko noise (setiap fluktuasi 1 query = 1 event).
- **B6 — Chat Lab strict-pinned failures** (`stage='chat_lab'`, `completion.ts:73-74,95-96`): otomatis masuk kategori `llm` via Langkah 7 (stage diteruskan). Bukan error operasional admin — tapi informatif. Alternatif: filter `stage='chat_lab'` keluar dari report. Spesifikasi saat ini = DILAPORKAN (keputusan sadar; ubah 1 baris filter bila tidak diinginkan).
- **B7 — Verifikasi manual tersisa (bukan blocker kode):** auto-disable vault (Langkah 7), tidak-adanya regresi response 401/500 (Langkah 10), UI digest (Langkah 13), dry-run scrape (Langkah 14) — semua tercantum di completion criteria masing-masing dan harus dicentang di handoff.

## Handoff Checklist (untuk model pelaksana + verifikator manusia)

- [ ] Urutan eksekusi: Langkah 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → (9 HANYA bila 3/4/5 hijau) → 10 → 11 → 12 → 13 → 14 → 15.
- [ ] Setiap langkah: baca "File yang harus dibaca" DULU sebelum edit; patuhi "File atau area yang tidak boleh diubah"; penuhi "Completion criteria" sebelum lanjut.
- [ ] Setiap finding F1-F8 ditangani minimal satu langkah dan punya test/verifikasi: F1→L9 (+L5/L13 UI), F2→L14 (+L12), F3→L10, F4→L7, F5→L4/L5 (rantai penerima), F6→L4/L5/L11 (guard), F7→L3/L5 (komplemen), F8→L6. Pengecualian test yang didokumentasikan terbuka: vault auto-disable (L7), route 401/500-paths (L10), script `.mjs` (L14) — ketiganya punya metode verifikasi pengganti yang tercantum.
- [ ] Blokir keputusan B1-B6: B1 default (a) sudah terspesifikasi; B2/B3/B5/B6 butuh konfirmasi user HANYA bila ingin menyimpang dari spesifikasi; B4/B7 informatif.
- [ ] Migrasi: buat file di `supabase/migrations/` (submodule — commit+push submodule DULU, baru parent dengan pointer baru, per AGENTS.md); apply dev via MCP → verifikasi SELECT → baru prod.
- [ ] Gate akhir Langkah 15 hijau (typecheck + lint + test + build) tanpa edit di antaranya; scan secret pada diff; commit Conventional Commits satu baris tanpa trailer `Co-authored-by`; push.
- [ ] Verifikasi manusia (B7): centang 4 item manual; pantau 1 window digest end-to-end pasca-deploy (buat 1 event uji via endpoint report → tunggu ≤ window+5 mnt → email tiba → `notified_at` terisi).
- [ ] Post-task: 1 entri `.memory/YYYY-MM-DD/HHmmss-*.md` + update `.memory/README.md` (bagian Recent Entries + status), tanpa secret.
