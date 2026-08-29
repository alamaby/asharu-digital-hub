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

- **Lokal:** `.env.local` (git-ignored, `SUPABASE_SECRET_KEY=sb_secret_...` + `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...`).
- **Vercel:** Project → Settings → Environment Variables (Production + Preview).
- **Supabase Vault:** `vault.create_secret` untuk `llm_provider_keys.vault_secret_id` (service_role only).
- **Build check:** `src/lib/env.ts` (`hasSupabase`, Zod `sb_secret_`/`eyJ` + `min 20`). `.env.example` placeholder harus lulus `npm run typecheck` tanpa bocor.

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
