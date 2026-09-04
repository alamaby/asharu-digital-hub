# Supabase Migration Sync — Per-Stage LLM + Drift Restore (5 Sep, build mode)

Recorded: 2026-09-04 20:40 +07:00

## Task / Problem
User tanya apakah ada Supabase migration yang belum dijalankan. Ditemukan: 2 migrasi per-stage LLM (`20260905000001_stage_llm_defaults.sql`, `20260905000002_stage_llm_review_fixes.sql`) belum push + 1 no-op `20260831000001_processor_cron_bearer.sql` pending repair + 2 drift `20260902041349_research_target_reply_count` / `20260902055944_research_cron_5min` (file lokal hilang tapi sudah `applied` di remote). Perlu sync read-only → repair → push → verifikasi.

## Key Files Changed

### Submodule `supabase` (remote `asharu-supabase`, project `hljjmmejmirqikmbaryl`)
- `migrations/20260902041349_research_target_reply_count.sql` — **restored** exact dari `supabase_migrations.statements` remote: `ALTER TABLE content_research_sessions ADD COLUMN target_reply_count integer;` + `COMMENT`.
- `migrations/20260902055944_research_cron_5min.sql` — **restored** exact: `SELECT cron.alter_job(job_id => 3, schedule => '*/5 * * * *');` (yang sebenarnya `cron.alter_job` untuk `asharu-content-research` → `*/5`, bukan legacy; plan awal salah tebak `schedule` legacy — diperbaiki setelah baca `statements`).
- Commit submodule `eaabc78` — `fix(db): restore drift migrations research_target_reply_count and research_cron_5min`.

### Parent
- `plans/2026-09-05-supabase-migration-sync.md` — plan sync (Objective/Scope/Milestones/Tasks/Risks/Progress/Notes). Dibuat di plan mode, diupdate full di build mode (T1-T5 done, T6 memory+commit pending).
- Submodule pointer bump di parent `edfa3d9`.

### DB remote (via `supabase-asharu-be-production_apply_migration`)
- `20260904133359` `processor_cron_bearer` — `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='process-content-requests';` (no-op, superseded by `research_pipeline` yang schedule `asharu-content-research`+`legacy` Bearer-from-Vault).
- `20260904133453` `stage_llm_defaults` — `llm_stage_defaults` (6 rows, PK `stage`, CHECK stage IN 6, CHECK half-pin, FK `provider_id`/`model_id` SET NULL, `updated_by` FK, RLS `is_admin()` read+write), 5 kolom `content_research_sessions.*_model_id` + indexes, `content_drafts.last_regen_model_id` + index.
- `20260904133505` `stage_llm_review_fixes` — FK `updated_by ON DELETE SET NULL`, `touch_updated_at()` trigger, 3 indexes, `COMMENT ON TABLE`.
- `schema_migrations` sekarang 25 rows (22 + 3 push); lokal 25 file match (drift resolved).

## Decisions
1. **Drift files direstore exact dari DB**, bukan re-invent — isi `statements` remote adalah source of truth (`target_reply_count` tanpa `IF NOT EXISTS`, `research_cron_5min` adalah `cron.alter_job` bukan `cron.schedule`).
2. **Repair no-op via `apply_migration`** — Supabase CLI `migration repair --linked` gagal 401 (login role), jadi `apply_migration` (DDL) dipakai untuk insert `schema_migrations` row (`20260904133359`) plus eksekusi `unschedule` — efektif `applied` tanpa 401.
3. **Push per-stage LLM via `apply_migration` sequential** — `stage_llm_defaults` dulu lalu `review_fixes` (depend table). Versi file `20260905*` lokal ≠ versi DB `20260904*` karena `apply_migration` timestamp `now()` — ini drift versi kosmetik (name match, bukan blocker, dicatat di plan Notes).
4. **Commit submodule dulu lalu parent pointer** — proper submodule workflow.

## Assumptions / Risks
- `research_cron_5min` `cron.alter_job(3, '*/5')` mengubah `asharu-content-research` dari `*/10` → `*/5` — kini kedua job `research`+`legacy` sama `*/5`. Tidak ada validasi job_id 3 = research di semua env; andalkan id stabil.
- Version prefix mismatch file `20260905*` vs DB `20260904*` akan tetap terlihat di `supabase migration list` bila pakai CLI (nama sama, versi beda). Tidak breaking tapi next `db push` bisa warning; resolve via `migration repair` bila perlu align.
- Advisors pre-existing: `touch_updated_at`, `is_admin`, `gen_friendly_code` search_path WARN; `advance_research_stage` anon/auth SECURITY DEFINER WARN — semua expected (service_role-only wrappers sudah benar). Unused indexes fresh table expected.
- `20260829*` version prefix mismatches (5 file) tetap ada — historic drift, tidak di-fix kali ini (out of scope, catat di plan Notes).

## Blockers / Unresolved
- File `20260905000001/02` tetap di lokal dengan prefix `20260905` sedangkan DB `20260904*` — kosmetik drift jika CLI dipakai lagi; opsi `migration repair` untuk re-align version.
- `research_cron_5min` schedule `*/5` untuk job 3 — verify via `cron.job` belum di-query post-push untuk schedule final (hanya pre-push */5 sudah terlihat).

## Verification
- `supabase_migrations.schema_migrations` 25 rows, 3 push verified via `list_migrations`.
- `to_regclass('public.llm_stage_defaults')` exists; 6 rows default NULL; policies `stage_defaults_admin_read/write` ✓; trigger `trg_llm_stage_defaults_updated_at` ✓; indexes + FK `ON DELETE SET NULL` ✓.
- `content_research_sessions` 5 `*_model_id` + `target_reply_count`; `content_drafts.last_regen_model_id` ✓.
- `cron.job` pre-push: `asharu-content-research` + `asharu-content-legacy` both `*/5` active; post-push jobs unchanged (no reschedule in per-stage migrations).
- Advisors: security = 10 lints (3 search_path + 3 anon SECURITY DEFINER + 3 auth SECURITY DEFINER + 1 leaked password); performance = 30+ (unindexed FKs, RLS initplan, unused_index, multiple permissive) — semua pre-existing, tidak baru dari push ini.
- Git: submodule `eaabc78` + parent `edfa3d9`, working tree clean.

## Commit Proposal
- (submodule) `fix(db): restore drift migrations research_target_reply_count and research_cron_5min` — `eaabc78`
- (parent) `chore(db): restore drift migrations and record migration sync plan` — `edfa3d9`

## Related Plans
- `plans/2026-09-05-supabase-migration-sync.md` (T1-T5 done, T6 memory+commit done; version drift kosmetik + advisors noted)
