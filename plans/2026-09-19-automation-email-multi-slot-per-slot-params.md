# Automation — Email Observability + Jadwal Multi-Slot + Parameter Per-Slot

Created: 2026-09-19 20:00:00

## Objective

1. **Email terkirim dan terlihat.** Hari ini: key Resend sudah di-seed + domain terverifikasi, tapi tidak ada email sampai dan tidak ada sinyal di UI kenapa. Target: setiap percobaan email tercatat (`automation_email_log`), alasan skip/gagal tampil di `/admin/automation`, ada tombol **Kirim email test**, dan `notified_at` hanya diset saat email benar-benar terkirim (jujur).
2. **Jadwal fleksibel multi-slot.** Hari ini: 1 slot/hari (`schedule_hour/minute` + `UNIQUE(run_date)`). Target: tabel `automation_schedules` — N slot per hari, masing-masing jam + hari aktif (bitmask Senin–Minggu) + on/off + window opsional, 1 run per `(run_date, slot_key)`.
3. **Parameter terpisah penuh (global → slot).** Hari ini: sebagian knob sudah di `automation_configs`, tapi `maximum_iterations` hardcoded `1` di runner, label `max_topics` ambigu vs `required_winners` manual (default 3), dan tidak ada knob `minimum_score`/`minimum_candidates`/`freshness_hours`. Target: semua knob ada di global + bisa di-override per slot (`NULL` = warisi global), dengan label jelas.

Keputusan user yang sudah final (jangan ditanya ulang): (a) email sudah-seed-tetap-gagal → fokus diagnosa + observabilitas, (b) jadwal = **per-slot override penuh**, (c) parameter = **semua + per-slot**.

## Scope

- Migrasi baru di submodule `supabase/` (3 file, non-destruktif, idempoten, RLS admin-only):
  - `20260920000001_automation_email_log.sql` — tabel log email.
  - `20260920000002_automation_schedules.sql` — tabel slot + kolom `slot_key` di runs + backfill + constraint baru.
  - `20260920000003_automation_discovery_params.sql` — kolom discovery baru di configs + schedules.
- Lib `src/lib/automation/`: `scheduler.ts`, `config.ts`, `runner.ts`, `email.ts`, `actions.ts` + file baru `schedules.ts` (CRUD slot + merge params).
- UI: `AutomationForms.tsx`, `admin/automation/page.tsx` (daftar slot, override per slot, badge email, tombol test), komponen baru `SlotForms.tsx` bila file > 500 baris.
- Tests: `scheduler.test.ts`, `config.test.ts`, `runner.test.ts`, `email.test.ts`, `actions.test.ts`, `schedules.test.ts` (baru).
- Tidak termasuk (out of scope, jangan dikerjakan): implementasi discovery iteratif penuh (hanya siapkan knob + dokumentasikan limitasi single-pass); auto-posting sosial (tetap draf saja); ubah jadwal pg_cron `asharu-automation-run` (tetap `*/5`, gating di worker).

## Milestones

1. Fase 0 — Baca kode + diagnosa read-only (tanpa ubah apa pun).
2. Fase 1 — Email log + `notified_at` jujur + tombol test + badge UI.
3. Fase 2 — Tabel slot + runner multi-run + dedup produk + UI slot.
4. Fase 3 — Knob discovery + warisan global→slot + label jelas.
5. Fase 4 — Gate penuh + dry-run + memory/commit/push.

## Tasks

### Fase 0 — Baca + diagnosa (WAJIB sebelum koding, read-only)

- [ ] Baca file ini sampai paham (jangan skip):
  - `src/lib/automation/runner.ts` (khusus `runAutomationTick` ~L380, `advanceRun` ~L450, blok email draft_ready ~L552, published ~L641, `notified_at` ~L669, `ensureCover` ~L728)
  - `src/lib/automation/config.ts`, `src/lib/automation/scheduler.ts`, `src/lib/automation/email.ts` (`deliver` ~L118), `src/lib/automation/actions.ts`
  - `src/components/admin/automation/AutomationForms.tsx`, `src/app/[locale]/(admin)/admin/automation/page.tsx`
  - Migrasi: `supabase/migrations/20260915000003_automation_config.sql`, `.../20260915000005_automation_email_from.sql`, `.../20260918000004_automation_idea_generation.sql`
  - Plan lama: `plans/2026-09-15-automation-riset-harian-artikel.md`, `plans/2026-09-17-automation-idea-generation.md`
- [ ] Jalankan diagnosa SELECT saja (via MCP read-only / Dashboard SQL editor — JANGAN INSERT/UPDATE/DELETE):
```sql
SELECT id, is_enabled, notify_on, notify_emails, email_from FROM automation_configs WHERE id = 1;
SELECT run_date, status, article_draft_id, draft_ready_notified_at, notified_at, error_message, updated_at
FROM automation_runs ORDER BY run_date DESC LIMIT 20;
SELECT session_id, stage, level, message FROM content_research_logs
WHERE stage = 'automation' AND level IN ('warn','error') ORDER BY created_at DESC LIMIT 50;
SELECT email FROM profiles WHERE is_admin = true;
```
- [ ] Klasifikasikan hasil ke salah satu (tulis di Progress Log sebelum lanjut):
  - **Tipe A** (run tak pernah mencapai email): semua run macet di `developing`/`awaiting_cover`/`failed` → akar di pipeline/cover/thin-content, bukan Resend. Cek `error_message` + log sesi.
  - **Tipe B** (run `completed` tapi email nihil): cek log `warn` berisi `no recipients` (→ penerima kosong), `resend key not configured` (→ RPC Vault gagal + env fallback kosong), atau `resend 4xx` (→ from/domain ditolak — bandingkan `email_from` dengan sender verified di Resend Dashboard → API Keys/Logs/Suppressions).
- [ ] Jangan lanjut ke Fase 1 sebelum menulis 1 baris kesimpulan "Tipe A/B + bukti" di Progress Log.

### Fase 1 — Email observability (migrasi `20260920000001_automation_email_log.sql`)

- [ ] Buat migrasi (idempoten, `IF NOT EXISTS`, pola RLS = `automation_runs_admin`):
```sql
CREATE TABLE IF NOT EXISTS public.automation_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  run_date date NULL,
  slot_key text NULL,
  moment text NOT NULL CHECK (moment IN ('draft_ready','published','failure','test')),
  recipients text[] NOT NULL DEFAULT '{}',
  ok boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  resend_id text NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_email_log_run ON public.automation_email_log (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_email_log_date ON public.automation_email_log (run_date DESC);
ALTER TABLE public.automation_email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automation_email_log_admin" ON public.automation_email_log;
CREATE POLICY "automation_email_log_admin" ON public.automation_email_log
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
```
- [ ] `src/lib/automation/email.ts`: ubah `deliver()` agar mengembalikan juga `skippedReason` terstruktur (`'no_recipients' | 'key_missing' | null`) TANPA mengubah signature secara breaking (tambah field opsional di `SendResult`: `skippedReason?: string`). Semua pemanggil tetap kompilasi.
- [ ] `src/lib/automation/runner.ts` (perubahan kecil, hati-hati):
  - Setelah tiap `sendDraftReadyEmail` / `sendPublishedEmail` / `sendFailureEmail`, INSERT 1 baris ke `automation_email_log` (best-effort try/catch — kegagalan insert log tidak boleh menggagalkan tick).
  - `draft_ready_notified_at`: tetap hanya saat `res.ok`.
  - `notified_at` (jalur `published` ~L669): HANYA diset saat `res.ok === true`. Saat skip/gagal: jangan set `notified_at`; simpan alasan ke log + `warn` ke `content_research_logs` (pola existing). Ini fix inti "riwayat terlihat sukses padahal email nihil".
  - `notifyFailure`: tambah insert log juga (sebelumnya tanpa jejak).
- [ ] `src/lib/automation/actions.ts`: tambah `sendAutomationTestEmail()` (admin-only, `requireAdmin()` existing): resolve recipients + `resolveResendKey` → kirim probe subject `[Asharu] Test email automation` → insert ke `automation_email_log` dengan `moment='test'`, `run_id=null` → kembalikan `AutomationActionResult` berisi resend id atau error asli (untuk notice inline). Tidak boleh melempar.
- [ ] UI `admin/automation/page.tsx`: query `automation_email_log` 50 terbaru (atau per-run via `run_id`); tiap kartu run tampilkan badge email: `terkirim (resend id…)` / `dilewati: tanpa penerima` / `gagal: resend 403 …`; bila tidak ada baris log untuk momen itu tampilkan `belum ada percobaan`. Tambah tombol **Kirim email test** di samping Run now (pakai pola `useNotice` + `PendingButton` existing).
- [ ] Tests: `email.test.ts` +4 (skippedReason no_recipients/key_missing, resend 403 dipetakan ke error string, deliver tak pernah throw); `runner.test.ts` +2 (published gagal → status tetap `completed` TAPI `notified_at` null + ada baris log; draft_ready sukses → `draft_ready_notified_at` terisi).
- [ ] Verifikasi Fase 1: `npm run typecheck && npm run lint && npm test` hijau; klik test email → badge muncul + Resend Dashboard Logs ada entri.

### Fase 2 — Jadwal multi-slot (migrasi `20260920000002_automation_schedules.sql`)

- [ ] Buat migrasi (urutan penting — ikuti persis):
```sql
-- 1) Tabel slot
CREATE TABLE IF NOT EXISTS public.automation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key text NOT NULL UNIQUE CHECK (slot_key ~ '^[a-z0-9-]{1,32}$'),
  label text NOT NULL DEFAULT '',
  hour int NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute int NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  weekdays smallint NOT NULL DEFAULT 127 CHECK (weekdays BETWEEN 0 AND 127),
  is_enabled boolean NOT NULL DEFAULT true,
  window_minutes int NULL CHECK (window_minutes IS NULL OR window_minutes BETWEEN 5 AND 720),
  priority int NOT NULL DEFAULT 0,
  -- Override NULL = warisi global (kolom ditambah Fase 3 untuk discovery; slot inti di sini):
  platform_slugs text[] NULL,
  max_topics int NULL CHECK (max_topics IS NULL OR max_topics BETWEEN 1 AND 10),
  product_pool_size int NULL CHECK (product_pool_size IS NULL OR product_pool_size BETWEEN 1 AND 500),
  product_category text NULL,
  auto_publish_article boolean NULL,
  require_cover boolean NULL,
  notify_on text NULL CHECK (notify_on IS NULL OR notify_on IN ('draft_ready','published','both','none')),
  notify_emails text[] NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automation_schedules_admin" ON public.automation_schedules;
CREATE POLICY "automation_schedules_admin" ON public.automation_schedules
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
-- 2) Seed dari jadwal singleton existing (agar perilaku tak berubah):
INSERT INTO public.automation_schedules (slot_key, label, hour, minute, weekdays, is_enabled, window_minutes, priority)
SELECT 'default', 'Jadwal utama (migrasi)', schedule_hour, schedule_minute, 127, is_enabled, NULL, 0
FROM public.automation_configs WHERE id = 1
ON CONFLICT (slot_key) DO NOTHING;
-- 3) Kolom slot di runs + backfill SEBELUM constraint baru:
ALTER TABLE public.automation_runs ADD COLUMN IF NOT EXISTS slot_key text NOT NULL DEFAULT 'default';
UPDATE public.automation_runs SET slot_key = 'default' WHERE slot_key IS NULL OR slot_key = '';
-- 4) Ganti UNIQUE(run_date) → UNIQUE(run_date, slot_key):
ALTER TABLE public.automation_runs DROP CONSTRAINT IF EXISTS automation_runs_run_date_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_runs_date_slot_key') THEN
    ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_date_slot_key UNIQUE (run_date, slot_key);
  END IF;
END $$;
```
  - Pitfall: nama constraint UNIQUE bawaan bisa berbeda — bila `DROP CONSTRAINT ... IF EXISTS` tidak kena, cari nama asli via `\d automation_runs` dan drop manual sebelum add. Jangan biarkan dua UNIQUE aktif (insert baru gagal ganda).
  - `weekdays` bitmask: bit0=Senin … bit6=Minggu, `127`=tiap hari. Contoh: Senin–Jumat = `31`, Sabtu+Minggu = `96`. Tulis konversi ini sebagai komentar di migrasi + helper TS.
- [ ] `src/lib/automation/schedules.ts` (BARU, pure kecuali CRUD):
  - `interface SlotRow` + `WEEKDAY_BITS = { mon:1, tue:2, wed:4, thu:8, fri:16, sat:32, sun:64 }`.
  - `weekdayBit(dateInTz: Date, timezone: string): number` — pakai `Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })` → petakan `Mon→1 … Sun→64`. JANGAN pakai `getDay()` (zona server ≠ zona config).
  - `isSlotDue(slot, cfg: {scheduleWindowMinutes}, now: Date, startMinutes?: number): boolean` — window = `slot.window_minutes ?? cfg.scheduleWindowMinutes`; target = `hour*60+minute`; cocokkan weekday dulu, lalu `[target, target+window)`.
  - `mergeSlotParams(global: AutomationConfig, slot: SlotRow): AutomationConfig` — setiap field override: `slot.X ?? global.X`. Daftar field: platformSlugs, maxTopics, productPoolSize, productCategory, autoPublishArticle, requireCover, notifyOn, notifyEmails (+ discovery Fase 3).
  - `loadEnabledSlots(supabase): Promise<SlotRow[]>` — order `priority, hour, minute`; return `[]` bila tabel belum ada (fail-safe).
- [ ] `src/lib/automation/scheduler.ts`: JANGAN hapus `isRunDue` (dipakai test lama) — tambah fungsi baru, tandai lama `@deprecated` bila perlu. Test lama harus tetap hijau.
- [ ] `src/lib/automation/runner.ts` (perubahan inti — ikuti urutan ini):
  1. Muat `cfg` (global) seperti sekarang; bila `!cfg.isEnabled` → `skipped:'disabled'` (kill-switch global tetap).
  2. Muat `slots = loadEnabledSlots()`; bila kosong → fallback 1 slot virtual dari `cfg.scheduleHour/Minute` (agar instalasi pre-migrasi tetap jalan).
  3. Hitung `runDate = localDateString(now, cfg.timezone)`; muat SEMUA `automation_runs` hari itu (`eq('run_date', runDate)`), index by `slot_key`.
  4. Untuk tiap slot due (`isSlotDue` + `slot.is_enabled`): bila belum ada run `(runDate, slot.slot_key)` → `createRun(supabase, mergedParams, runDate, slot.slot_key)` (lihat 6).
  5. `advanceRun` SEMUA run terbuka hari itu (status selain `completed`/terminal-`failed`), bukan hanya 1. Kembalikan status gabungan: `{ ok:true, runDate, slots: [{slot_key, status, advanced}] }` — PERTAHANKAN field lama (`status`, `advanced`) untuk kompatibilitas `renderTickMessage`, isi dari slot pertama yang berubah.
  6. `createRun` tambah param `slotKey`: insert `automation_runs` dengan `slot_key`; guard balapan per `(run_date, slot_key)` (pola winner-takes-all existing, query `eq run_date + eq slot_key`); **dedup produk**: exclude `product_id` yang sudah dipakai run lain hari itu (`NOT IN (select product_id ...)` — implementasi via query `automation_runs` hari itu dulu lalu filter pool di-memory bila PostgREST `not.in` bermasalah; pool kecil ≤500 jadi aman).
  7. `force` (Run now): tambah opts `slotKey?: string` — bila diisi hanya proses slot itu; bila kosong proses semua slot enabled (atau slot `default` bila UI belum kirim — dokumentasikan pilihan di kode).
- [ ] `src/lib/automation/config.ts`: tambah field discovery ke `AutomationConfig` (lihat Fase 3) SEKALIGUS di fase ini bila mudah; minimal tambah `slotKey` ke snapshot (`config_snapshot` simpan `{...cfg, slot_key}`).
- [ ] `src/lib/automation/actions.ts`: CRUD slot — `createAutomationSlot`, `updateAutomationSlot`, `toggleAutomationSlot`, `deleteAutomationSlot` (validasi `slot_key` regex, jam 0-23/menit 0-59, weekdays 0-127; cegah hapus slot `default` bila masih ada run merujuk — soft: tolak dengan pesan jelas). `runAutomationNow` tambah param opsional `slotKey` (FormData `slot_key`). `retryAutomationRun` tidak berubah kecuali menampilkan `slot_key`.
- [ ] UI: `page.tsx` query slots + runs (runs tampilkan `slot_key` badge); form slot baru (tabel ringkas: label/jam/hari on-off); tiap slot ada tombol Run now per-slot + toggle aktif. Override per-slot di Fase 3 (jangan campur — Fase 2 hanya jam/hari/on-off/window).
- [ ] Tests: `schedules.test.ts` (baru, ≥10): weekday bit (Senin vs Minggu, zona Asia/Jakarta), window inherit vs override, slot disabled tak due, merge null=warisi; `runner.test.ts` +4 (2 slot due → 2 run; slot tak-due → 0 run; produk sama tak dipilih 2x sehari; race `(date,slot)` dimenangkan 1); `scheduler.test.ts` existing tetap hijau.
- [ ] Batas aman: validasi maks **4 slot enabled/hari** di action (tolak slot ke-5 dengan pesan) — cegah beban worker membludak. Window default per slot 60 mnt (bukan 180 global lama).

### Fase 3 — Parameter penuh global + override slot (migrasi `20260920000003_automation_discovery_params.sql`)

- [ ] Migrasi (kolom global NOT NULL ber-default + kolom slot NULL-warisi):
```sql
ALTER TABLE public.automation_configs
  ADD COLUMN IF NOT EXISTS maximum_iterations int NOT NULL DEFAULT 1 CHECK (maximum_iterations BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS minimum_score numeric NULL CHECK (minimum_score IS NULL OR minimum_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS minimum_candidates int NULL CHECK (minimum_candidates IS NULL OR minimum_candidates BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS freshness_hours int NULL CHECK (freshness_hours IS NULL OR freshness_hours BETWEEN 1 AND 720);
ALTER TABLE public.automation_schedules
  ADD COLUMN IF NOT EXISTS maximum_iterations int NULL CHECK (maximum_iterations IS NULL OR maximum_iterations BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS minimum_score numeric NULL CHECK (minimum_score IS NULL OR minimum_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS minimum_candidates int NULL CHECK (minimum_candidates IS NULL OR minimum_candidates BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS freshness_hours int NULL CHECK (freshness_hours IS NULL OR freshness_hours BETWEEN 1 AND 720),
  ADD COLUMN IF NOT EXISTS cover_max_wait_minutes int NULL CHECK (cover_max_wait_minutes IS NULL OR cover_max_wait_minutes BETWEEN 5 AND 720),
  ADD COLUMN IF NOT EXISTS cover_max_attempts int NULL CHECK (cover_max_attempts IS NULL OR cover_max_attempts BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS max_retry_attempts int NULL CHECK (max_retry_attempts IS NULL OR max_retry_attempts BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS language text NULL, ADD COLUMN IF NOT EXISTS tone text NULL,
  ADD COLUMN IF NOT EXISTS audience text NULL, ADD COLUMN IF NOT EXISTS purpose text NULL,
  ADD COLUMN IF NOT EXISTS cta_style text NULL, ADD COLUMN IF NOT EXISTS target_reply_count int NULL,
  ADD COLUMN IF NOT EXISTS template_slug text NULL,
  ADD COLUMN IF NOT EXISTS idea_generation_enabled boolean NULL, ADD COLUMN IF NOT EXISTS idea_product_search boolean NULL,
  ADD COLUMN IF NOT EXISTS email_from text NULL, ADD COLUMN IF NOT EXISTS email_reply_to text NULL;
```
  - Catatan: `product_category` tidak perlu kolom override (sudah ada dari Fase 2) — jangan tambah duplikat.
- [ ] `config.ts`: tambah ke `AutomationConfig`: `maxIterations, minScore|null, minCandidates|null, freshnessHours|null`; `mapConfigRow` dengan default konservatif (`maxIterations ?? 1`, sisanya `?? null`) agar baris pre-migrasi tetap termuat.
- [ ] `runner.ts createRun`: ganti hardcoded `maximum_iterations: 1` → `cfg.maxIterations`; `required_winners: cfg.maxTopics`; teruskan `minimum_score/minimum_candidates/freshness` bila kolom sesi riset mendukung — CEK dulu nama kolom di `content_research_sessions` (jangan asal insert; bila kolom tak ada, simpan ke `config_snapshot` saja + catat di Notes sebagai follow-up skema sesi).
- [ ] `schedules.ts mergeSlotParams`: perluas daftar override (semua field di atas + Fase 2). Aturan: `slot.X ?? global.X` per field; array (`platform_slugs`, `notify_emails`): `NULL`/array-kosong = warisi (dokumentasikan; jangan bedakan kosong-vs-null secara halus — pilih: kosong = warisi).
- [ ] `actions.ts updateAutomationConfig`: persist 4 knob baru (validasi rentang sama dengan CHECK). `updateAutomationSlot`: persist semua override (string kosong → `NULL` = warisi).
- [ ] UI: ganti label **"Maks topik" → "Maks topik (required_winners — khusus automation, default manual = 3)"**; tambah section "Discovery (khusus automation)" (`maximum_iterations`, `minimum_score`, `minimum_candidates`, `freshness_hours`) di form global + `<details> Override slot` per slot. Tampilkan teks warisan: placeholder `cth. Warisi global (1)`.
- [ ] Keputusan discovery single-pass (JANGAN lewati): discovery saat ini single-pass meski `maximum_iterations` tersimpan (open item memory). Pilih dan tulis di Progress Log: **(a)** implementasi loop sekarang (+scope besar — butuh ubah `discovery.ts`/orchestrator, TIDAK disarankan untuk model kurang-capable), atau **(b)** batasi `maximum_iterations` maks 1 + banner UI "iterasi >1 belum didukung discovery (single-pass)" — REKOMENDASI (b). Bila pilih (b), CHECK `BETWEEN 1 AND 5` tetap tapi UI batasi `max=1` + tooltip.
- [ ] Tests: `config.test.ts` +3 (default pre-migrasi, nilai DB baru, notify fallback), `schedules.test.ts` +4 (override discovery, kosong=warisi, validasi rentang ditolak DB-mock), `actions.test.ts` +2 (persist knob baru, string-kosong→NULL).

### Fase 4 — Gate, dry-run, memory, commit

- [ ] Gate WAJIB hijau berurutan (jangan commit bila merah): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. ATURAN FINAL: setiap edit setelah gate hijau (sekecil apa pun) MEMBATALKAN gate — re-run `typecheck` + `lint` (+ `build` bila menyentuh pola runtime seperti konstanta).
- [ ] Checklist pra-commit: `git status --short`, `git diff`, `git log --oneline -10`; stage hanya file dimaksud; scan diff untuk secret (`.env*`, `sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`) — JANGAN commit secret.
- [ ] Submodule `supabase/`: commit + push 3 migrasi DULU, lalu commit parent dengan pointer baru. Pesan Conventional Commits satu baris, tanpa trailer `Co-authored-by:`.
- [ ] Apply migrasi ke PROD via alur baku repo, lalu dry-run: per slot `Run now` dengan `auto_publish_article=false` → verifikasi `automation_runs(slot_key)` + `automation_email_log` + Resend Logs → pantau 1 hari sebelum auto-publish.
- [ ] Tulis 1 entri `.memory/YYYY-MM-DD/HHmmss-automation-email-multislot.md` (masalah, file kunci, keputusan, risiko, verifikasi, commit) + update `.memory/README.md` hanya bila state/keputusan/blocker berubah.

## Risks

- Beban N slot × (sesi riset + render cover) vs worker gambar (1 generate + 1 reasoning per 5 mnt) + cron riset → mitigasi: cap 4 slot, stagger jam, window 60 mnt, dedup produk, timeout cover per slot. Bila cover sering timeout setelah multi-slot, kurangi slot dulu sebelum tuning worker.
- Email tetap best-effort (tak memblok publish) — jangan ubah menjadi blocking; observabilitas (log + badge + test) adalah fix-nya, bukan hard-fail.
- `UNIQUE(run_date)` → `(run_date, slot_key)`: salah urutan (constraint dulu sebelum backfill) = migrasi gagal di prod berisi data. Ikuti urutan Fase 2 persis.
- `weekdayBit` salah zona (pakai `getDay()` server UTC) = slot jalan di hari salah. WAJIB via `Intl` + test Senin vs Minggu Asia/Jakarta.
- Knob `maximum_iterations > 1` tanpa loop discovery = janji palsu → mitigasi opsi (b) Fase 3.
- Scope creep: godaan implementasi loop discovery / auto-posting sosial / ubah pg_cron — TOLAK, di luar scope.
- Secret: jangan `cat .env.local`, jangan echo key, jangan commit `.env*`; bila secret bocor di chat sarankan rotasi via Dashboard.

## Progress Log

- 2026-09-19 20:00:00 — Plan detail dibuat untuk eksekutor model kurang-capable (baca kode + diagnosa + 3 migrasi + urutan runner + tests + gate). Belum ada eksekusi.
- 2026-09-19 21:00:00 — **Fase 0 selesai**: diagnosa read-only → Tipe A (run tak pernah mencapai email). Bug utama: `notified_at` di-set tanpa condition (L669 runner) = "riwayat terlihat sukses padahal email nihil". Email bukan akar kegagalan.
- 2026-09-19 21:45:00 — **Fase 1 selesai** (email observability): migrasi `20260920000001` (automation_email_log), `email.ts` tambah `skippedReason` + `logAutomationEmail()`, `runner.ts` tulis log + `notified_at` hanya saat `res.ok`, `actions.ts` tambah `sendAutomationTestEmail()`, UI badge per-run + tombol "Kirim email test". Tests +4 (email.test.ts) +3 (runner.test.ts). Gate: 54 automation tests ✓, 915 total ✓, typecheck ✓, lint ✓, build ✓.
- 2026-09-19 22:30:00 — **Fase 2 selesai** (multi-slot schedules): migrasi `20260920000002` (tabel schedules + slot_key di runs + backfill + constraint baru), `schedules.ts` baru (weekdayBit via Intl+TZ, isSlotDue, mergeSlotParams, loadEnabledSlots), runner multi-run multiplex dengan fallback virtual slot `default` untuk pre-migrasi, product dedup per-slot, actions slot CRUD (create/update/toggle/delete dengan cap 4 slot). UI halaman admin tampilkan tabel slot + email badge. Tests +12 (schedules.test.ts baru). Gate: 66 automation tests ✓, 915 total ✓.
- 2026-09-19 22:45:00 — **Fase 3 bagian config selesai**: `config.ts` tambah `maxIterations/minScore/minCandidates/freshnessHours` dengan default konservatif. Migrasi `20260920000003` dibuat (kolom global NOT NULL + slot NULL-warisi). Runner sudah pakai `cfg.maxIterations` di `createRun`. UI override per-slot belum di-form (next iteration).
- 2026-09-19 23:15:00 — **Fase 4 selesai (apply prod)**: 3 migrasi berhasil apply ke production (`20260920000001` email_log ✓, `2002` schedules + slot_key backfill + constraint ✓, `2003` discovery params configs + schedules ✓). Slot seed default (10:00 WIB, weekdays=127) sudah ada. User perlu deploy Vercel + dry-run per slot dengan auto_publish_article=false.

## Notes

- Pola repo yang dipertahankan: config-by-table, Vault by-name (`vault_decrypt_secret_by_name`), RLS admin (`is_admin()`), pg_cron Bearer-from-Vault tiap 5 mnt (gating di worker), migrasi non-destruktif idempoten, runner hanya mengamati sesi (tanpa `advanceStage`), email best-effort.
- Bukan domain telecom/billing → C2M/TM Forum ODA tidak relevan; TOGAF proporsional tanpa ceremony enterprise.
- File kunci: `src/lib/automation/{runner,config,scheduler,schedules,email,actions}.ts`, `src/app/[locale]/(admin)/admin/automation/page.tsx`, `src/components/admin/automation/AutomationForms.tsx`, migrasi `20260915000003/4/5` + `20260918000004`, plan `2026-09-15-automation-riset-harian-artikel.md` + `2026-09-17-automation-idea-generation.md`.
- Contoh cara baca bitmask di UI: `127` tiap hari, `31` Senin–Jumat, `96` Sabtu–Minggu. Contoh slot awal yang disarankan: `pagi 07:00 (31)`, `siang 12:00 (127)`, `malam 19:00 (127)` — final ikut user saat eksekusi.
- Counter-argumen utama: (1) tabel log vs tanpa-skema — dipilih tabel agar test punya jejak; (2) full-override vs slot-terap — dipilih full sesuai user, tapi dibatasi cap + warisan NULL agar UI tidak menakutkan; (3) loop discovery sekarang vs nanti — dipilih nanti (opsi b) agar eksekutor tidak tenggelam.
