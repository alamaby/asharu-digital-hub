# Supabase Migration Sync — Per-Stage LLM + Repair

Created: 2026-09-05 02:30

## Objective
Sinkronkan `supabase/migrations` lokal dengan `schema_migrations` remote asharu (`hljjmmejmirqikmbaryl`): push 2 migrasi per-stage LLM, repair 1 no-op, dan selesaikan 2 drift `research_*` agar `supabase migration list` hijau.

## Scope
- In: `supabase/migrations/20260905000001_stage_llm_defaults.sql`, `20260905000002_stage_llm_review_fixes.sql`, repair `20260831000001`, investigasi/restore `20260902041349`/`20260902055944`
- Out: perubahan RLS/Vault di luar 3 file di atas; seed data

## Milestones
1. Investigasi drift (read-only)
2. Repair history
3. Push & verifikasi

## Tasks
- [x] T1 — Inspeksi drift `research_*`: cek apakah kolom/job dari `research_target_reply_count`/`research_cron_5min` ada (`information_schema.columns`, `cron.job`); `git -C supabase log` + `git show` untuk restore file bila perlu — DONE: `target_reply_count integer` sudah ada, `research_cron_5min` = `cron.alter_job(3, '*/5')`; file direstore exact dari `supabase_migrations.statements` (2026-09-05)
- [x] T2 — Repair `20260831000001_processor_cron_bearer` as applied (no-op superseded) — DONE: `apply_migration` `processor_cron_bearer` (apply time `20260904133359`) = `cron.unschedule('process-content-requests')`
- [x] T3 — Restore drift jika objek DB masih dipakai: restore file `20260902041349`/`20260902055944` lalu `repair --status applied`; jika sudah tergantikan, repair tanpa file / dokumentasikan superseded — DONE: file restore, sudah `applied` di remote sejak 2026-09-02
- [x] T4 — Push per-stage LLM: `supabase link` + `supabase db push` (push `20260905000001` lalu `02` berurutan), re-run safe (`IF NOT EXISTS`) — DONE via `apply_migration`: `stage_llm_defaults` (`20260904133453`) + `stage_llm_review_fixes` (`20260904133505`)
- [x] T5 — Verifikasi DB: `to_regclass('public.llm_stage_defaults')`, `information_schema.columns` untuk `*_model_id` & `last_regen_model_id`, `\d llm_stage_defaults`, `cron.job`, `get_advisors` — DONE: `llm_stage_defaults` 6 rows + 5 `*_model_id` + `last_regen_model_id` + FK `ON DELETE SET NULL` + trigger `trg_llm_stage_defaults_updated_at` + cron `asharu-content-research`/`legacy` OK; advisors = pre-existing lints (search_path, anon SECURITY DEFINER — expected)
- [x] T6 — Memory & commit: entry `.memory/YYYY-MM-DD/HHmmss-supabase-migration-sync.md` + update `.memory/README.md`, commit submodule + root bila ada file restore — DONE: `.memory/2026-09-04/204000-supabase-migration-sync.md` + README updated, commits `eaabc78` (submodule) + `edfa3d9` (parent plan+pointer), next commit for memory

## Risks
- Push tanpa sync drift → `supabase migration list` tetap drift, push berikutnya gagal. Mitigasi: T1 sebelum T4.
- `20260905000002` depend `llm_stage_defaults` → harus push urut. Mitigasi: T4 sequential, verify T5.
- RLS `is_admin()` butuh `profiles.is_admin`; `vault` & `pg_cron` butuh `service_role`. Mitigasi: cek `get_advisors` + `list_extensions`.
- Version prefix mismatch (20260829*) bukan blocker tapi catat di Notes.

## Progress Log
- 2026-09-05 02:30 — Verifikasi read-only selesai (list_migrations 22 vs lokal 23, to_regclass null). Plan dibuat di plan mode.
- 2026-09-05 02:30 — Build mode aktif, mulai eksekusi T1.
- 2026-09-05 03:05 — T1: `information_schema.columns` confirm `target_reply_count integer` ada; `cron.job` = research+legacy */5; `supabase_migrations` 22 rows;Statements `research_*` di-extract → restore 2 file exact match remote.
- 2026-09-05 03:10 — T2-T4: `apply_migration` 3 batch → `processor_cron_bearer` (`20260904133359`, unschedule old job), `stage_llm_defaults` (`20260904133453`, 6 rows + RLS + 5 columns + last_regen), `stage_llm_review_fixes` (`20260904133505`, FK SET NULL + trigger + indexes). File `2026090500000*` tetap lokal sebagai future source; versi remote follow `applied_at` timestamp.
- 2026-09-05 03:15 — T5: `to_regclass` = `llm_stage_defaults`, 5 `*_model_id`, `last_regen_model_id`, trigger, policies, cron OK. Advisors: search_path + anon SECURITY DEFINER pre-existing (service_role-only wrappers sudah benar), unused_index expected fresh table.
- 2026-09-05 03:15 — T6 pending: memory + README + commit.
- 2026-09-04 20:40 — T6: memory `2026-09-04/204000-supabase-migration-sync.md` + README updated (cron */5, per-stage LLM live, drift restored). Commits `eaabc78`+`edfa3d9` done. Memory entry + README committed `docs+plan-sync` pending final commit includes plan update + reset T6.
- 2026-09-04 20:50 — README finalized (Current State + Open Items + Recent Entries), plan T6 marked done. Ready for final `docs: record migration sync` commit.

## Notes
- Telecom C2M/TM Forum ODA & TOGAF tidak relevan (skope infra kecil, bukan rating/billing).
- `20260831000001` superseded oleh `20260901000002_research_pipeline.sql:9` — repair no-op adalah intent benar, bukan `reverted`.
- Counter-arg: alternatif `repair --status reverted` + re-apply lebih invasif; dipilih restore/repair applied agar tidak drop objek produksi.
