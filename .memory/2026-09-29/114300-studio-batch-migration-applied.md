# Studio batch migration applied (prod)

Date: 2026-09-29 11:43 WIB

## Task
Apply `20260929000001_studio_batch.sql` ke Supabase production (`supabase-asharu-be-production`) atas instruksi eksplisit user ("bantu apply migration").

## Key files (tidak ada perubahan file — hanya apply live)
- `supabase/migrations/20260929000001_studio_batch.sql` (sudah commit `b7584d1`, pointer parent `8368e5b`)

## Decisions
- Pre-check dulu via `list_migrations` + `SELECT` read-only: migrasi belum tercatat (76 migrasi, tanpa hit `20260929*batch`), `studio_batches` NULL, `max_batch_prompts`/`batch_id` 0 → apply dibenarkan.
- Pakai `apply_migration(name: "studio_batch")` dengan SQL persis isi file (idempoten: `IF NOT EXISTS`).
- Instruksi user eksplisit menang atas aturan read-only MCP (precedence AGENTS.md).

## Assumptions / risks
- Target proyek benar = `supabase-asharu-be-production` (konsisten dengan riwayat apply via MCP).
- Migrasi aditif non-destruktif; risiko rendah. RLS `studio_batches` meniru pola `user_image_generations`.
- Blocker operasional tetap: `daily_limit` default 20 < cap batch 50 → naikkan ke ≥50 (rekomendasi 100) sebelum uji batch-50.

## Verification (post-apply)
- `studio_batches` ada, `max_batch_prompts` default 50, `batch_id` uuid, 2 index, 4 policy.
- `list_migrations`: tercatat `20260929044323 / studio_batch` (total 77).
- Security advisors: tidak ada finding baru untuk `studio_batches` (finding RLS-no-policy hanya tabel staging afiliasi pre-existing).

## Commit
n/a — tidak ada perubahan file; tidak commit/push (keputusan memori #7).

## Related
- `plans/2026-09-29-studio-batch-generate-plan.md` (S0–S8 selesai, S9 QA manual terbuka)
