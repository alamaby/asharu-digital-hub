# Content Factory Security & Consistency Audit (30 Agu)

Recorded: 2026-08-30 21:45

## Task / Problem
Audit mendalam (read-only) atas keamanan dan konsistensi content factory: RLS, otorisasi processor, key pool, dual-write, rate limit, guard admin. Tidak ada perubahan kode/DB dari audit ini — hasilnya laporan keputusan untuk fix.

## Temuan (ringkas, prioritas)

### P0 — segera
1. **`/api/content/process` menerima header `x-vercel-cron` apa pun** (`src/app/api/content/process/route.ts:26-33`). Karena `vercel.json` crons = [] (cron pindah ke pg_cron), TIDAK ADA pemanggil sah yang mengirim header ini lagi — header murni spoofable. Siapa pun bisa POST → processor berjalan → membakar token LLM. Dikombinasikan dengan (3) dan (5) = rantai abuse penuh.
2. **pg_cron mengirim `x-vercel-cron: 1`**, bukan `Authorization: Bearer CRON_SECRET` (`supabase/migrations/20260829000008_processor_cron.sql`) — akar masalah #1 di sisi DB. Fix: pg_net kirim header Authorization; CRON_SECRET via GUC/custom Postgres config (JANGAN literal di migration = secret masuk git); processor wajib Bearer di produksi.

### P1 — penting
3. **INSERT anon pada `content_requests` tanpa limit di level DB** (`content_factory.sql:262`). Rate limit + honeypot hanya di Server Action; publishable key publik → spam bisa insert langsung via Supabase REST.
4. **`get_llm_key(uuid)` (0002) SECURITY DEFINER tanpa REVOKE** → executable PUBLIC via PostgREST; mengembalikan secret Vault ATAU plaintext. Butuh uuid key (tidak enumerable), tapi tetap oracle rahasia terbuka. Ikuti pola 0003 (REVOKE + GRANT service_role).
5. **Key plaintext di kolom `api_key_encrypted`** — komentar migration mengakui "stored as plain text (MVP)". Re-seed via Vault, NULL-kan kolom, drop.
6. **KeyPool menghukum key untuk error konten, bukan hanya error kredensial** (`key-pool.ts:47`): JSON parse invalid, thread shape invalid, max_chars overload — semuanya `markKeyFailure`. Model yang konsisten menghasilkan output invalid → semua key semua provider ter-nonaktif permanen (`failure_count > 5` → `is_active=false`, tanpa auto-recovery). Fix: klasifikasi error (hanya 401/403/429/5xx yang menghukum key).
7. **Retry tanpa batas**: catch processor reset status ke `pending` (`route.ts:245`), `content_requests` tidak punya kolom attempt → request yang gagal permanen (mis. `target_category` tanpa produk aktif) diulang tiap 5 menit selamanya, tiap retry membakar panggilan LLM.

### P2 — harus diperbaiki
8. **Race claim processor**: claim gagal ("already claimed") → catch reset `status='pending'` TANPA cek status saat ini → bisa meng-undo claim worker lain → draft duplikat saat overlap.
9. **Rate limit**: `getClientIp` pakai entri PERTAMA `x-forwarded-for` (verifikasi perilaku Vercel — bisa spoofable); check/increment non-atomik (race); rate limit hanya di app, bukan DB.
10. **Soft-delete scraper tanpa ambang keamanan** (`scrape-affiliate.mjs:181-188`): scrape transient yang balik sedikit item → menonaktifkan mayoritas produk DB. Tambah guard (mis. abort bila removal > 20%).
11. **ContentDraftCard mengabaikan error Supabase** (`updateStatus`/`saveEdit` tanpa cek error) — UI optimistis walau RLS menolak.
12. **Email admin ter-hardcode di 4 tempat** (middleware, review page, `is_admin()`, `handle_new_user`) — ganti admin = 4 edit. Jadikan `profiles.is_admin` satu sumber kebenaran.

### P3 — hygiene
13. `markKeyUsage`/`markKeyFailure` select-then-update non-atomik (gunakan RPC increment).
14. Middleware `auth.getUser()` (network) di SETIAP request non-statis — latensi; persempit matcher.
15. `getServiceClient` terduplikasi 3 file (service.ts, actions.ts, rate-limit.ts).
16. `rate_limits` tidak pernah dibersihkan (tumbuh tanpa batas).
17. Halaman review mengiklankan realtime (copy UI) tapi `supabase.channel` tidak diimplementasi; fallback polling juga tidak ada.
18. GET diizinkan di process route (tidak berbahaya, auth sama — catatan saja).
19. `target_category` tidak divalidasi terhadap kategori produk yang ada saat submit → request gagal-garansi (terkait #7).

### Yang sudah baik (jangan rusak saat fix)
- RLS ketat untuk sisanya: `llm_*`, `rate_limits`, `content_drafts` (INSERT tidak ada policy → hanya service_role), `profiles` self-or-admin.
- RPC Vault 0003/0004 sudah benar (REVOKE + GRANT service_role).
- Validasi output LLM berlapis: shape Zod, tepat 1 `{{PRODUCT_URL}}`, max_chars per platform.
- Key tidak pernah di-log; env validation ketat (Zod, fail-fast).

## Blockers / Unresolved
- Semua fix BUTUH keputusan user (audit = assessment). P0 #1/#2 diusulkan jadi plan terpisah (menyentuh migration submodule + route + env Vercel).
- Verifikasi DB live tidak bisa via MCP (server MCP tersambung ke project `albot-be`, bukan asharu) — cek manual via Dashboard/SQL editor asharu: (a) `SELECT (vault_secret_id IS NOT NULL), (api_key_encrypted IS NOT NULL) FROM llm_provider_keys;`, (b) distribusi status `content_requests`, (c) error terakhir `llm_call_logs`.
- Verifikasi apakah `CRON_SECRET` sudah diset di Vercel env produksi.

## Verification
- Audit murni baca kode: 14 file (route, middleware, migrasi 0000–0008, vault.ts, key-pool.ts, rate-limit.ts, actions.ts, registry.ts, scrape-affiliate.mjs, ContentDraftCard.tsx, env.ts, review page, .env.example) + cek live `https://asharu.id` (respons OK).

## Commit Proposal
`docs(memory): record content factory audit findings`

## Related Plans
- Usulan: `plans/2026-08-30-content-factory-audit-fixes.md` (belum dibuat — menunggu keputusan user)
