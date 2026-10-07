# Apply 3 migrasi atomik ke prod (rate limit, claim guard, counters)

Date: 2026-10-07 16:36 WIB

## Task
Apply `20261007000001/002/003` ke Supabase production (`supabase-asharu-be-production`) atas instruksi eksplisit user ("bantu apply migration, gunakan mcp supabase-asharu-be-production dan script helper").

## Key files (tidak ada perubahan file — hanya apply live)
- `supabase/migrations/20261007000001_atomic_rate_limit.sql` (sudah commit `1ae3183`)
- `supabase/migrations/20261007000002_social_queue_claim_guard.sql` (sudah commit `1ae3183`)
- `supabase/migrations/20261007000003_atomic_counters.sql` (sudah commit `71c973d`)
- Catatan helper: tidak ada `scripts/*migration*` / `scripts/*apply*` di repo (glob nihil) — apply dilakukan langsung via MCP `apply_migration` dengan SQL persis isi file, sesuai pola entry `2026-09-29/114300-studio-batch-migration-applied.md`.

## Decisions
- Pre-check dulu via `list_migrations` + `SELECT` read-only: 3 migrasi belum tercatat (tail di `20260929044323/studio_batch`), `claimed_at` NULL, 4 function kosong, index kosong → apply dibenarkan.
- Urutan apply 001 → 002 → 003 (rate limit dulu, lalu claim guard, lalu counters).
- Apply #3 gagal di percobaan pertama: `GRANT EXECUTE ON FUNCTION increment_failure_counter(text, uuid)` — signature salah, harusnya `(text, uuid, int)` sesuai file baris 77. Transaksi rollback penuh (verifikasi `pg_proc` kosong) → apply ulang dengan SQL benar sukses.
- Instruksi user eksplisit menang atas aturan read-only MCP (precedence AGENTS.md, sama seperti entry studio_batch 29 Sep).

## Assumptions / risks
- Target proyek benar = `supabase-asharu-be-production` (konsisten riwayat apply via MCP).
- Migrasi aditif non-destruktif (`CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`); risiko rendah.

## Verification (post-apply)
- `list_migrations` tail: `20261007093539/atomic_rate_limit`, `20261007093545/social_queue_claim_guard`, `20261007093613/atomic_counters` (total 80).
- 4 function ada: `consume_rate_limit(p_ip text, p_scope text, p_limit integer, p_window_minutes integer DEFAULT 60)`, `cleanup_expired_rate_limits`, `increment_usage_counter`, `increment_failure_counter`.
- `social_post_queue.claimed_at timestamptz` ada; index `idx_social_queue_stale_claims` ada.
- Security advisors: tidak ada finding baru untuk 4 function baru (search_path dikunci + REVOKE anon/authenticated benar); sisa finding pre-existing (affiliate staging, `is_admin`/`gen_friendly_code`/`touch_updated_at` search_path, `advance_research_stage`/`handle_new_user` SECURITY DEFINER, leaked-password, FK unindexed, RLS initplan).

## Commit
n/a — tidak ada perubahan kode; hanya memory entry + update `.memory/README.md` (Open Items dicentang).

## Related
- `.memory/2026-10-07/121500-review-hardening-p0-p1-p2.md` (sumber 3 migrasi; Risks "Migrasi belum di-apply ke prod" kini tertutup)
- `.memory/README.md` (Open Items: Apply 3 migrasi → SELESAI)
- `.memory/2026-09-29/114300-studio-batch-migration-applied.md` (pola apply sebelumnya)
