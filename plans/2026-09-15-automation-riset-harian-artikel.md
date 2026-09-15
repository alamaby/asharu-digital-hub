# Automation Riset Harian → Artikel (configurable by table)

Created: 2026-09-15 18:58:24

## Objective

Cron otomatis yang jalan setiap **10:00 Asia/Jakarta** (GMT+7): pilih acak 1 dari 50
produk afiliasi terbaru, buat sesi riset mekanisme produk-terpilih (`mechanism='dua'`)
untuk platform **artikel + twitter + threads**, batasi **1 topik**, hasilkan **1 draf
per platform**, pastikan **cover/visualisasi utama benar-benar ter-generate** sebelum
publish, lalu auto-publish artikel dan kirim email notifikasi via **Resend API**.
Semua parameter perilaku disimpan di tabel config (`automation_configs`).

## Scope

- Migrasi baru (submodule `supabase/`): `automation_configs` (singleton), `automation_runs`
  (1 baris per hari), cron `asharu-automation-run` (*/5, gated jam config).
- Lib baru `src/lib/automation/`: `config.ts`, `scheduler.ts`, `runner.ts`, `email.ts`.
- Refactor publish artikel: ekstrak `publishArticleDraftCore` dari `approveArticleAndPublish`
  agar bisa dipakai automation tanpa gate admin.
- Fix bug pre-existing excerpt: parser menerima ≤2000 char sementara DB CHECK 50–500
  → clamp deterministic `clampArticleExcerpt` + repair 1x.
- Route `src/app/api/automation/run/route.ts` (Bearer cron).
- Admin UI `/admin/automation` (edit config + riwayat run + Run now/Retry) + i18n id/en.
- Vault `resend_api_key` + script seed + env fallback dev.
- Tests pure helpers + regression publish.

## Milestones

1. Fase 0 — Data & jadwal: migrasi, Vault/Resend, cron.
2. Fase 1 — Core automation: config, scheduler, runner, email, refactor publish, fix excerpt.
3. Fase 2 — Endpoint `/api/automation/run` + tests.
4. Fase 3 — Admin UI `/admin/automation` + i18n.
5. Fase 4 — Gate + dry-run + aktivasi + memory/commit.

## Tasks

### Fase 0 — Migrasi (submodule `supabase/` dulu, lalu parent)
- [x] `20260915000003_automation_config.sql`: tabel `automation_configs` (singleton `id=1`, seed **disabled**)
      — `is_enabled`, `schedule_hour`=10, `schedule_minute`=0, `timezone`='Asia/Jakarta',
      `platform_slugs`='{artikel,twitter,threads}', `product_pool_size`=50, `product_category`,
      `max_topics`=1, `language`, `tone`, `audience`, `purpose`, `cta_style`, `target_reply_count`,
      `require_cover`=true, `cover_max_wait_minutes`=60, `cover_max_attempts`=3,
      `auto_publish_article`=true, `notify_on`='both', `notify_emails text[]`, `email_from`,
      `email_reply_to`, `last_run_at`; RLS admin-only (`is_admin()`). (+ `schedule_window_minutes`,
      `max_retry_attempts` ditambah saat implementasi) **APPLIED prod 15 Sep, terverifikasi.**
- [x] Tabel `automation_runs`: `run_date date UNIQUE`, `status` CHECK
      (`session_created|developing|awaiting_cover|publishing|published|notifying|completed|failed`),
      `config_snapshot jsonb`, `product_id`, `session_id`, `article_draft_id`, `article_ids uuid[]`,
      `cover_attempts`, `draft_ready_notified_at`, `published_at`, `notified_at`, `error_message`;
      RLS admin-only; index `(status)`, `(run_date)`. **APPLIED prod, 2 policies.**
- [x] `20260915000004_automation_cron.sql`: `cron.schedule('asharu-automation-run','*/5 * * * *',
      net.http_post https://asharu.id/api/automation/run Bearer dari Vault, timeout 290000)`. **APPLIED prod.**
- [x] `scripts/seed-resend-key.mjs` → Vault `resend_api_key`.
- [x] `env.ts` + `.env.example`: `RESEND_API_KEY` opsional (fallback dev) + `env.test.ts` sync.

### Fase 1 — Core
- [x] `src/lib/automation/config.ts`: `loadAutomationConfig`, `resolveRunLocales`, `resolveRecipients`.
- [x] `src/lib/automation/scheduler.ts` (pure): `localDateString`, `localMinutes`, `isRunDue`,
      `pickRandomProduct` (crypto `randomInt`).
- [x] `src/lib/automation/runner.ts`: `runAutomationTick` + `advanceRun`. Mekanisme disempurnakan:
      runner **mengamati** status sesi (tidak panggil `advanceStage`, tanpa tabrakan cron riset),
      shortlist/advance hanya di `awaiting_selection`; hapus state `notifying` yang tak terpakai.
- [x] `src/lib/articles/publish.ts`: `publishArticleDraftCore`; `actions.ts` wrapper admin-gated (dikurangi 151 baris).
- [x] `src/lib/automation/email.ts`: Resend via `fetch` + key Vault → env, timeout AbortController.
- [x] Fix excerpt: `clampArticleExcerpt` + `ARTICLE_EXCERPT_MAX` + normalisasi parse + test regresi.

### Fase 2 — Endpoint
- [x] `src/app/api/automation/run/route.ts` (`GET`/`POST`, `isCronAuthorized`, `maxDuration=300`).

### Fase 3 — Admin UI
- [x] `/admin/automation`: form config lengkap + tabel `automation_runs` + Run now/Retry, nav
      (`adminAutomation` di `admin-nav.ts` + `navigation.ts` + `routing.ts` pathname), i18n id/en.

### Fase 4 — Verifikasi
- [x] Tests: `scheduler.test.ts` (13), `config.test.ts` (6), `email.test.ts` (5), `runner.test.ts` (8),
      excerpt clamp (5). Total suite **655 tests hijau**.
- [x] `npm run typecheck` ✓ `npm run lint` ✓ `npm test` ✓ `npm run build` ✓ (rute `/api/automation/run`
      + `/[locale]/admin/automation` ter-build).
- [x] Migrasi applied prod + advisor keamanan diperiksa (hanya temuan pra-eksisting; tabel baru tanpa temuan).
- [x] Commit/push submodule (`873e8f0`) → parent (`24e3bdb`).
- [ ] **Dry-run produksi [USER ACTION]:** di `/id/admin/automation` aktifkan kill-switch + `Run now`
      dengan `auto_publish_article=false`/`require_cover=true` untuk uji 1 hari, lalu nyalakan auto-publish.
- [ ] Seed Resend key ke Vault (`node --env-file=.env.local scripts/seed-resend-key.mjs`) + verifikasi domain Resend.

## Risks

- Auto-publish tanpa review berisiko halusinasi/afiliasi salah tayang → switch config + dry-run + email draft-ready.
- Gate publish tetap menolak thin content (<600 kata) → run `failed` + email (tidak tayang).
- Cover bergantung worker gambar global (1 generate + 1 reasoning per 5 mnt) → timeout configurable.
- Resend butuh domain/from verified; **kegagalan email (atau email tidak dikonfigurasi sama sekali)
  tidak pernah menghentikan workflow** — semua jalur notifikasi best-effort dan run tetap `completed`.
- `UNIQUE(run_date)` → tidak auto-retry hari yang sama; tombol Retry manual.
- Konkurensi: automation hanya *mengamati* status; shortlist/advance idempoten.

## Progress Log

- 2026-09-15 18:58:24 — Plan dibuat berdasarkan riset kode. Temuan kunci: mekanisme `dua`
  melewati verify/scoring dan berhenti di `awaiting_selection`; `approveArticleAndPublish`
  admin-gated dan tidak mewajibkan cover; worker image auto-cover hanya sampai `prompt_ready`
  (belum render); tidak ada integrasi email sama sekali; pola config-by-table sudah mapan.
- 2026-09-15 21:10:00 — Jaminan "workflow tetap jalan meski email gagal" (`3ea8827`).
  Audit menemukan 4 jalur yang masih bisa melempar dan menghentikan tick: `resolveResendKey`
  (RPC jaringan), `resolveRecipients` (query profiles), `productLabel` (query produk), dan
  `loadArticleLinks` (query artikel) — semuanya di luar try/catch `sendViaResend`. Fix:
  (1) satu fungsi `deliver()` yang membungkus semua pengiriman dan selalu mengembalikan
  `SendResult`; (2) `resolveResendKey`/`resolveRecipients`/`productLabel` anti-throw (fallback
  `null`/`[]`/`'(produk)'`); (3) blok notifikasi `draft_ready`, `published`, dan `notifyFailure`
  dibungkus try/catch dan dicatat `warn` ke `content_research_logs`; (4) render payload juga
  ter-guard. Efek: run selalu maju ke `completed` setelah publish, apa pun nasib emailnya;
  `notify_on='none'` pun tetap berjalan. +5 test (10 → 15 email test). Gate: typecheck ✓ lint ✓
  **662 tests** ✓ build ✓.
- 2026-09-15 20:12:00 — Hardening pasca-review sendiri (commit `d220acb`): (1) insert
  `automation_runs` gagal tidak lagi meninggalkan sesi orphan — sesi dibuang bila kalah balapan
  `UNIQUE(run_date)`, atau ditandai `failed` bila error lain; (2) **bug retry**: `cover_started_at`
  tidak pernah di-persist saat null, sehingga batas tunggu cover ter-reset tiap tick dan tidak
  pernah timeout — kini di-persist; (3) retry otomatis & manual me-reset `cover_started_at` dan
  menolak retry bila sesi riset sendiri `failed` (butuh intervensi di halaman Riset); (4) guard
  `article_draft_id` kosong di `ensureCover`. +2 test regresi (10 total runner). Gate: typecheck ✓
  lint ✓ **657 tests** ✓ build ✓.
- 2026-09-15 19:35:00 — Implementasi selesai + migrasi applied prod. Keputusan saat eksekusi:
  (1) runner **tidak** memanggil `advanceStage` (hanya mengamati) untuk menghindari balapan
  dengan cron riset; (2) cover auto di-flip `prompt_ready → pending` agar worker merender
  gambar sungguhan (bukan hanya menyiapkan prompt); (3) `notifying` dihapus dari alur (disimpan
  di CHECK untuk kompatibilitas); (4) ditambah `schedule_window_minutes` (jendela jadwal) dan
  `max_retry_attempts` (retry harian) — mencegah run tengah malam saat kill-switch baru dinyalakan;
  (5) fix excerpt dilakukan di parser (`clampArticleExcerpt`) sehingga draf tersimpan selalu
  DB-valid, tanpa perlu migrasi pelebaran CHECK. Gate: typecheck ✓ lint ✓ 655 tests ✓ build ✓.
  Dipush submodule `873e8f0`, parent `24e3bdb`.

## Notes

- Mengikuti pola repo: config-by-table, Vault by-name (`vault_decrypt_secret_by_name`),
  RLS admin (`is_admin()`), pg_cron Bearer-from-Vault, migrasi non-destruktif.
- Bukan domain telecom/utility rating, sehingga C2M/TM Forum ODA tidak relevan; TOGAF
  diterapkan proporsional (tanpa ceremony enterprise).
- Keputusan user (2026-09-15): auto-publish tanpa review; twitter & threads cukup draf
  (tidak auto-queue sosial); 1 topik → 1 draf per platform (3 total); email draft-ready &
  published via config; auto-render cover + gate sebelum publish; fix excerpt di fase yang sama.
