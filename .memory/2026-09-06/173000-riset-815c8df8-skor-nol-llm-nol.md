# Riset 815c8df8: skor 0 semua + LLM terakhir (0)

- Task: user lapor 3 topik `final_score=0.0` + blok Performa `LLM terakhir (0)` padahal search (1) muncul. Screenshot mobile admin detail.
- Root cause (verifikasi MCP asharu prod):
  1. Skor 0: scoring LLM (`cloudflare qwen3-30b`) sebenarnya return 3 breakdown valid (7.2/6.6/...) dengan topic_id BENAR, tapi `parseScoringOutput` pakai regex greedy + tanpa maxTokens → output terpotong → parse gagal → `return []` sunyi → log `scored 0 topic(s)` → pipeline lanjut ke awaiting_selection dengan skor 0. Sama terjadi di verifying (`verification returned 0`, status tetap pending).
  2. LLM (0): `llm_call_logs` hanya punya policy `no_read` untuk anon/authenticated; halaman detail admin baca via user-JWT (`createSupabaseServer`) → RLS blokir → 0 baris. (9 log LLM sesi ini ADA di DB; halaman `/admin/llm/logs` pakai service client sehingga normal.)
- Key files: `src/lib/research/scoring.ts` (maxTokens 4000, extractLargestJson brace-matched, validasi ID vs kandidat, throw jujur + log error saat 0, update guard session_id), `src/lib/research/verification.ts` (maxTokens 2000, parser sama, guard session_id), `src/lib/llm/providers/gemini.ts` (totalTokens = p+c), `supabase/migrations/20260906000003_llm_logs_admin_read.sql` (policy admin read, applied prod via MCP).
- Decisions: scoring gagal → throw (failed + bisa resume, topik utuh) daripada skor 0 sunyi; verifikasi tetap warn-and-continue (by design); ID halusinasi ditolak, skor parsial valid tetap dipakai.
- Risks: sesi gagal di scoring kini butuh resume manual (tambah 1 klik) — diterima demi anti shortlist-buta. Cloudflare tetap tanpa usage (API tidak return) → kolom token null untuk provider itu; bukan bug kita.
- Blockers: data sesi ini TIDAK di-backfill (breakdown topik #3 terpotong di log; tidak mau fabrikasi skor). Opsi follow-up: admin shortlist ulang manual atau rescore action (belum ada).
- Verification: `typecheck` ✓, `lint` ✓, `52/52` tests research+llm ✓, policy `llm_call_logs_admin_read` terkonfirmasi di pg_policies.
- Commit proposal: `fix(research): honest scoring failure plus admin log read plus token totals`
- Related: `plans/2026-09-06-riset-815c8df8-fix-retry-tavily-log-perf.md`, sesi `815c8df8-b483-42a8-963b-3e77cb801dc2`.
