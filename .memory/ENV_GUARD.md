# Env Guard — Supabase Secret Keys

**Status: ACTIVE — Harus dibaca sebelum menyentuh env**

## Aturan Keras

1. **JANGAN PERNAH** print, log, echo, atau `cat` nilai `.env*`, `SUPABASE_*`, `sb_secret_*`, `sb_publishable_*`, `CRON_SECRET`, atau Vault secret ke chat, tool output, code comment, atau markdown.
2. **JANGAN PERNAH** tulis nilai real di `.env.example` — hanya placeholder (`sb_secret_...placeholder`, `sb_publishable_...placeholder`, `eyJ...placeholder`). Placeholder tetap valid Zod (`min 20` + prefix `sb_secret_`/`sb_publishable_`/`eyJ`) tapi jelas fake.
3. **JANGAN PERNAH** commit `.env`, `.env.local`, `.env*.local` — sudah di `.gitignore`. Hanya commit `.env.example` dengan placeholder.
4. **Gunakan `process.env` di runtime** — jangan assign ke variabel yang di-log, jangan `console.log(process.env)`, jangan `echo $SUPABASE_SECRET_KEY`.
5. **Jika tool call akan expose** (mis. `cat .env.local`, `grep -r sb_secret`), **tolak** dan sarankan `grep --exclude=".env*"` atau `echo "[REDACTED]"`.
6. **Jika secret terlanjur bocor** di chat, segera sarankan rotasi: Supabase Dashboard → API Keys → Create secret key → update Vault + Vercel env → revoke old.

## Tempat Secret yang Benar

- **Supabase (env, bukan Vault):**
  - **Lokal:** `.env.local` (git-ignored) → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` (atau deprecated `ANON_KEY`), `SUPABASE_SECRET_KEY=sb_secret_...` (atau deprecated `SERVICE_ROLE_KEY`), `CRON_SECRET`.
  - **Vercel:** Project → Settings → Environment Variables (Production + Preview) — isi 4 key di atas.
  - **Build check:** `src/lib/env.ts` (`hasSupabase`, Zod `sb_publishable_`/`sb_secret_`/`eyJ` + `min 20`). `.env.example` hanya placeholder kosong, jadi `hasSupabase=false` dan build tetap hijau.

- **LLM Provider Keys (Vault, BUKAN .env):**
  - **Kenapa tidak di `.env.example`?** Karena 1 provider bisa punya **banyak key** (round-robin), dan key LLM (Naraya/OpenRouter/Gemini/Cloudflare) jumlahnya dinamis, bukan 1 env var. Menyimpan di `.env` akan butuh `NARAYA_KEY_1`, `NARAYA_KEY_2` … dan redeploy tiap tambah key.
  - **Disimpan di:** Supabase Vault (tabel `llm_provider_keys.vault_secret_id` → `vault.decrypted_secrets`), terenkripsi `pgsodium`, RLS `service_role` only.
  - **Cara isi (MVP, tanpa log secret):** `node --env-file=.env.local scripts/seed-llm-keys.mjs` (interactive, tanya `Provider slug` + `API key` + `priority`, hash `sha256` untuk dedup, tidak `console.log` key). Atau Dashboard → Database → Vault → Create secret.
  - **Rotasi:** Jika bocor, `UPDATE llm_provider_keys SET is_active=false WHERE key_hash='...'` + seed key baru + revoke di provider Dashboard.
  - **Fallback:** `src/lib/llm/key-pool.ts` sudah `ORDER BY priority, last_used_at` + `failure_count >5` circuit breaker → otomatis pindah key/provider berikutnya.

## Contoh Aman vs Tidak Aman

```ts
// ✅ Aman — baca di runtime, tidak di-log
const supabase = createClient(env.supabaseUrl!, env.supabaseSecretKey!);

// ❌ Tidak aman — jangan lakukan
console.log(process.env.SUPABASE_SECRET_KEY);
cat .env.local  // tool call
```

## Referensi

- `src/lib/env.ts` — `supabaseSecretKey` (prefer) + `supabaseServiceRoleKey` (deprecated alias, hapus 2025-12)
- `src/lib/supabase/service.ts` — `getServiceClient()` pakai `SUPABASE_SECRET_KEY ?? SERVICE_ROLE`
- `.env.example` — hanya placeholder, kosong sampai user isi
- `AGENTS.md` § Safety → Env Guard
