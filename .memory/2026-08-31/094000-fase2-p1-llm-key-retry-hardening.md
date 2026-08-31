# Fase 2 P1 — LLM Key Pool & Content Request Retry Hardening (31 Agu)

Recorded: 2026-08-31 09:40

## Task / Problem
Lanjutan audit 2026-08-30 (P1): (a) `get_llm_key()` SECURITY DEFINER tanpa REVOKE → secret oracle via PostgREST untuk anon/authenticated; (b) key plaintext di kolom `api_key_encrypted`; (c) KeyPool menghukum key untuk error konten (JSON/shape/max_chars) → deaktivasi permanen cascade; (d) retry tanpa cap → request gagal permanen diulang tiap 5 menit, membakar LLM calls; (e) P2 race: catch reset `status='pending'` tanpa cek → undo claim worker lain. Lanjutan kerja sesi sebelumnya yang sudah menulis sebagian (types/providers/key-pool/migrations) tapi belum di-commit; sesi ini melengkapi `route.ts` + tests + gate + apply DB + commit.

## Key Files Changed
- `src/lib/llm/types.ts` — class `LLMHttpError(status, message)` (sesi sebelumnya).
- `src/lib/llm/providers/{openai-compatible,gemini,cloudflare}.ts` — throw `LLMHttpError(res.status, …)` (sesi sebelumnya). Gemini: key pindah query string → header `x-goog-api-key`.
- `src/lib/llm/key-pool.ts` — `markKeyFailure` hanya untuk `LLMHttpError` status 401/403/429 (sesi sebelumnya). 5xx & plain Error (error konten) tidak blame key.
- `src/lib/llm/key-pool.test.ts` — tests klasifikasi: 429 blames key; 401 blamed (circuit breaker); 5xx & content-error TIDAK blame (sesi ini).
- `src/app/api/content/process/route.ts` — `MAX_ATTEMPTS=3`; flag `claimedByUs`; catch: hanya row milik kita (status='processing') yang di-reset, `attempts` di-increment, cap → 'failed' terminal (sesi ini).
- `supabase/migrations/20260829000002_add_api_key_fallback.sql` — di-commit (sebelumnya untracked; prasyarat `get_llm_key` + kolom `api_key_encrypted`; sudah live).
- `supabase/migrations/20260831000002_lock_get_llm_key.sql` — REVOKE dari PUBLIC/anon/authenticated, GRANT service_role.
- `supabase/migrations/20260831000003_migrate_plaintext_keys_to_vault.sql` — plaintext → `vault.create_secret`, NULL kolom (no-op di live: semua key sudah di Vault).
- `supabase/migrations/20260831000004_request_attempts_failed.sql` — `attempts int default 0` + status check termasuk `failed`.

## Decisions
1. Klasifikasi error mengikuti **plan** (bukan literal audit): hanya 401/403/429 blame key. Audit menyebut 5xx blame; plan menyempurnakan — 5xx = outage provider, bukan salah key → tidak menonaktifkan. Implementasi sesuai plan.
2. `attempts` di-increment pada **failure** (bukan claim). Cap 3 → `failed` terminal. Tidak di-reset pada sukses (histrik, tidak mengganggu).
3. Race claim (P2) ditutup sekalian: `claimedByUs` flag — claim-failure (row milik worker lain) TIDAK disentuh di catch; reset di-guard `.eq('status','processing')`.
4. `get_llm_key` REVOKE aman: `vault.ts` pakai service_role + `vault_decrypt_secret` RPC + select kolom langsung; TIDAK memanggil `get_llm_key` RPC → REVOKE hanya menutup oracle, tidak merusak app.
5. Migrasi foundational `20260829000002_add_api_key_fallback.sql` di-commit karena prasyarat 0002_lock (REVOKE butuh fungsi ada); sebelumnya untracked padahal sudah live → commit sync repo↔DB.

## Assumptions / Risks
- `route.ts` baru merefer `attempts` → butuh migration 0004 applied. DB live sudah di-apply (sesi ini). Deploy order: migration 0004 sudah live → deploy kode aman. Factory saat ini stopped (P0 fail-closed) jadi tidak ada traffic.
- `(req.attempts ?? 0) + 1`: klien supabase un-typed (tanpa generated `Database` types) → `req.attempts` loose, aman dari typecheck.
- Hibrida: `key-pool.ts` (sesi sebelumnya, sudah ada) + `route.ts`/tests (sesi ini) di-commit bersama — konsisten.
- Risiko: 3 baris `processing` nyangkut (lihat Blockers) tidak auto-recover.

## Blockers / Unresolved
- **Belum PUSH** (memory decision #7: no push tanpa instruksi eksplisit user). Commit lokal saja: submodule `7fb73d8`+`7bf4f30`, parent `5b7e5d9`.
- **3 baris `content_requests` status='processing' nyangkut** — korban fail-closed P0 (di-claim lalu endpoint 401). Saat factory resume, claim hanya pick `pending` → 3 baris ini tidak diproses. Mutasi data prod **tidak** dilakukan otomatis. Opsi user: (a) `UPDATE … SET status='pending', attempts=0` untuk reprocess, atau (b) `SET status='failed'`.
- **Magic-link `token_hash` flow** (`src/app/[locale]/auth/exchange/page.tsx` + `supabase/templates/magic_link.html`) — KONSEP TERPISAH, TIDAK di-commit Fase 2. Template masih `{ .ConfirmationURL }` (tak kirim `token_hash`) → cabang `token_hash` di exchange page = dead code. Butuh keputusan/plan terpisah. Ditinggalkan uncommitted.
- Setup P0 (seed Vault `asharu_cron_secret` → Vercel `CRON_SECRET` → apply `20260831000001`) masih jadi gate factory resume.

## Verification
- Gate hijau: `npm run lint` ✓; `tsc --noEmit` ✓; `vitest run` 173/173 ✓ (+1 net: 429 + circuit→401 + 5xx/content-no-blame); `next build` ✓.
- DB live verifikasi (MCP asharu, read-only SELECT): `get_llm_key` grant kini {postgres, service_role} (anon/authenticated/PUBLIC revoke); `content_requests.attempts` = integer NOT NULL default 0; `content_requests_status_check` termasuk `failed`.
- Pre-check: klien supabase tak punya generated `Database` types (grep `Database`/`database.types` 0 hit) → update `attempts` tidak rusak typecheck.

## Commit Proposal
- (parent, sudah lokal) `fix(content): harden llm key pool and cap content request retries`
- (submodule, sudah lokal) `fix(db): lock get_llm_key, migrate plaintext keys to vault, cap content request retries` + `fix(db): add missing api_key_encrypted fallback migration`
- (docs, akan commit) `docs: record fase 2 p1 hardening in plan and memory`

## Related Plans
- `plans/2026-08-31-content-factory-audit-fixes.md` (Fase 2 tasks diceklist; Progress Log di-update).
- `.memory/2026-08-30/214500-content-factory-audit.md` (sumber temuan P1).
- `.memory/2026-08-31/080400-p0-processor-cron-auth-fix.md` (P0, gate resume factory).
