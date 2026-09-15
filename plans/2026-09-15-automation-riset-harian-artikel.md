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
- [ ] `20260915000003_automation_config.sql`: tabel `automation_configs` (singleton `id=1`, seed **disabled**)
      — `is_enabled`, `schedule_hour`=10, `schedule_minute`=0, `timezone`='Asia/Jakarta',
      `platform_slugs`='{artikel,twitter,threads}', `product_pool_size`=50, `product_category`,
      `max_topics`=1, `language`, `tone`, `audience`, `purpose`, `cta_style`, `target_reply_count`,
      `require_cover`=true, `cover_max_wait_minutes`=60, `cover_max_attempts`=3,
      `auto_publish_article`=true, `notify_on`='both', `notify_emails text[]`, `email_from`,
      `email_reply_to`, `last_run_at`; RLS admin-only (`is_admin()`).
- [ ] Tabel `automation_runs`: `run_date date UNIQUE`, `status` CHECK
      (`session_created|developing|awaiting_cover|publishing|published|notifying|completed|failed`),
      `config_snapshot jsonb`, `product_id`, `session_id`, `article_draft_id`, `article_ids uuid[]`,
      `cover_attempts`, `draft_ready_notified_at`, `published_at`, `notified_at`, `error_message`;
      RLS admin-only; index `(status)`, `(run_date)`.
- [ ] `20260915000004_automation_cron.sql`: `cron.schedule('asharu-automation-run','*/5 * * * *',
      net.http_post https://asharu.id/api/automation/run Bearer dari Vault, timeout 290000)`.
- [ ] `scripts/seed-resend-key.mjs` → Vault `resend_api_key`.
- [ ] `env.ts` + `.env.example`: `RESEND_API_KEY` opsional (fallback dev).

### Fase 1 — Core
- [ ] `src/lib/automation/config.ts`: `loadAutomationConfig`, `resolveRunLocales`, `resolveRecipients`.
- [ ] `src/lib/automation/scheduler.ts` (pure): `localDateString`, `localMinutes`, `isRunDue`,
      `pickRandomProduct` (crypto `randomInt`).
- [ ] `src/lib/automation/runner.ts`: `runAutomationTick` + `advanceRun` (amati status sesi,
      jangan panggil `advanceStage`; shortlist+advance di `awaiting_selection`; render cover;
      publish; email best-effort; log).
- [ ] `src/lib/articles/publish.ts`: `publishArticleDraftCore`; `actions.ts` wrapper admin-gated.
- [ ] `src/lib/automation/email.ts`: Resend via `fetch` + key Vault → env.
- [ ] Fix excerpt: `clampArticleExcerpt` + normalisasi parse + repair 1x di
      `generateArticleAndInsertDraft` + test regresi.

### Fase 2 — Endpoint
- [ ] `src/app/api/automation/run/route.ts` (`GET`/`POST`, `isCronAuthorized`, `maxDuration=300`).

### Fase 3 — Admin UI
- [ ] `/admin/automation`: form config + tabel `automation_runs` + Run now/Retry, nav, i18n id/en.

### Fase 4 — Verifikasi
- [ ] Tests: `scheduler.test.ts`, `runner.test.ts`, `email.test.ts`, excerpt clamp + publish regression.
- [ ] `npm run typecheck && npm run lint && npm test && npm run build`.
- [ ] Dry-run → aktivasi (`is_enabled=true` + auto-publish).
- [ ] Update `.memory/` + commit/push (submodule → parent).

## Risks

- Auto-publish tanpa review berisiko halusinasi/afiliasi salah tayang → switch config + dry-run + email draft-ready.
- Gate publish tetap menolak thin content (<600 kata) → run `failed` + email (tidak tayang).
- Cover bergantung worker gambar global (1 generate + 1 reasoning per 5 mnt) → timeout configurable.
- Resend butuh domain/from verified; kegagalan email tidak memblok publish.
- `UNIQUE(run_date)` → tidak auto-retry hari yang sama; tombol Retry manual.
- Konkurensi: automation hanya *mengamati* status; shortlist/advance idempoten.

## Progress Log

- 2026-09-15 18:58:24 — Plan dibuat berdasarkan riset kode. Temuan kunci: mekanisme `dua`
  melewati verify/scoring dan berhenti di `awaiting_selection`; `approveArticleAndPublish`
  admin-gated dan tidak mewajibkan cover; worker image auto-cover hanya sampai `prompt_ready`
  (belum render); tidak ada integrasi email sama sekali; pola config-by-table sudah mapan.

## Notes

- Mengikuti pola repo: config-by-table, Vault by-name (`vault_decrypt_secret_by_name`),
  RLS admin (`is_admin()`), pg_cron Bearer-from-Vault, migrasi non-destruktif.
- Bukan domain telecom/utility rating, sehingga C2M/TM Forum ODA tidak relevan; TOGAF
  diterapkan proporsional (tanpa ceremony enterprise).
- Keputusan user (2026-09-15): auto-publish tanpa review; twitter & threads cukup draf
  (tidak auto-queue sosial); 1 topik → 1 draf per platform (3 total); email draft-ready &
  published via config; auto-render cover + gate sebelum publish; fix excerpt di fase yang sama.
