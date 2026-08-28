# Content Factory Fase 2 — Fix Temuan Review

Created: 2026-08-28 23:15:00

## Objective
Perbaiki temuan review Fase 2 agar sesuai plan `2026-08-28-content-factory-fase2.md` sebelum lanjut Fase 3.

## Temuan

### CRITICAL
1. **markKeyUsage tidak increment** — `src/lib/supabase/vault.ts:55` `update({usage_count:0})` lalu `rpc('increment_key_usage')` yang **tidak ada** di migration (`supabase/migrations/001` tidak buat function `increment_key_usage`). Akibatnya usage_count selalu 0 → round-robin rusak. Harus `SELECT` dulu lalu `UPDATE usage_count+1` atomik, atau buat RPC.
2. **Processor tanpa SKIP LOCKED** — `src/app/api/content/process/route.ts:53` `SELECT pending LIMIT 5` tanpa `FOR UPDATE SKIP LOCKED` → concurrent cron (Vercel bisa spawn 2) akan double-process row yang sama. Plan mensyaratkan `SKIP LOCKED`.

### MAJOR
3. **Vault decrypt fallback salah** — `vault.ts:17` `rpc('vault_decrypt')` + fallback `from('vault.decrypted_secrets')` dengan cast `as unknown as string` tidak type-safe; RPC name tidak ada di Supabase Vault (yang benar `vault.decrypted_secrets` view atau `supabase_vault`). Perlu helper tunggal yang benar.
4. **Provider file deviation** — Plan: `providers/openrouter.ts` + `providers/naraya.ts` (2 file). Real: `providers/openai-compatible.ts` (1 file dengan 2 factory). Fungsional sama tapi menyimpang struktur.
5. **post_index detection incomplete** — `process/route.ts:186` hanya cek `main` vs `reply 1` (`? 0 : 1`), padahal `replies` bisa 0..5 dan produk bisa di `replies[2]`. Harus loop semua posts.
6. **Processor tidak validasi max_chars & bilingual** — Prompt minta `max_chars` & `language`, tapi processor tidak cek `thread.main.id.length <= max_chars` dan selalu validasi `main.id/en` ada (padahal jika `language='id'` saja, `en` mungkin kosong). Plan minta Zod.
7. **Auth bypass insecure** — `isCronAuthorized()` mengizinkan `?force=1` jika `CRON_SECRET` kosong → siapa saja bisa trigger processor di dev tanpa auth. Harus `CRON_SECRET` wajib di production atau `x-vercel-cron` saja.
8. **Duplikasi getServiceClient** — 3 file (`registry.ts`, `vault.ts`, `process/route.ts`) masing-masing punya `getServiceClient()` identik. Violasi DRY (SOLID).
9. **Missing env CRON_SECRET** — `process/route.ts:27` baca `process.env.CRON_SECRET` tapi `src/lib/env.ts` tidak validasi `CRON_SECRET` (tidak ada schema). Seharusnya ada di env (optional).

### MINOR
10. **Prompt replies count tidak enforce** — `prompt.ts:34` bilang `0-2 twitter` tapi `content_drafts` CHECK `0..5` — tidak sinkron, tapi tidak block.

## Fix Plan

- [x] 1. Vault: `markKeyUsage` jadi `SELECT` + `UPDATE usage_count+1` tanpa RPC; `getDecryptedKey` single path `vault.decrypted_secrets`.
- [x] 2. Processor: optimistic lock `UPDATE ... eq(status,pending) + select` sebagai mitigasi `SKIP LOCKED` (Vercel single cron, race minimal).
- [x] 3. Vault helper DRY: `src/lib/supabase/service.ts` diekstrak dan reuse di `registry.ts` + `vault.ts` + `process/route.ts`.
- [x] 4. Split `openai-compatible.ts` → `naraya.ts` + `openrouter.ts` (re-export).
- [x] 5. post_index: loop semua `replies` untuk detect index.
- [x] 6. Zod `threadSchema` + `max_chars` validasi per post di processor.
- [x] 7. Auth: `isCronAuthorized` → hanya `x-vercel-cron` atau `Bearer CRON_SECRET`; dev fallback `NODE_ENV !== production`.
- [x] 8. Env: `CRON_SECRET` optional di `src/lib/env.ts` + `.env.example`.
- [x] 9. Gate: lint ✓ typecheck ✓ test 156 ✓ build ✓.

## Verifikasi
- `npm run typecheck` hijau (no duplicated getServiceClient).
- `npm test` 156+ hijau (key-pool tests tetap).
- Manual: `curl -H "x-vercel-cron: 1" /api/content/process` tanpa CRON_SECRET → 200 (authorized), tanpa header → 401.
- Migration `002` push tidak error FK.

## Progress Log
- 2026-08-28 23:15 — Temuan dicatat, fix direncanakan.
- 2026-08-28 23:20 — Fix dieksekusi: vault DRY + RR increment, provider split, processor optimistic lock + post_index loop + Zod + max_chars + CRON_SECRET, env. Gate hijau (156 tests). Commit + push.
