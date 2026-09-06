#!/usr/bin/env node
/**
 * Seed the Threads long-lived token into Supabase Vault (Fase 0, step 8).
 * Secret name default: `threads_access_token_asharu_id` (matches
 * social_accounts.vault_secret_name seed). The pipeline reads it via the
 * service_role-only `vault_decrypt_secret_by_name` RPC — the token never
 * lives in Vercel env and never gets printed.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-threads-token.mjs
 *   # prompts interactively for token + threads user id + expiry days.
 *
 * - Rotation: re-run with a new token — a new Vault entry is created and the
 *   RPC picks the newest (ORDER BY created_at DESC). Delete stale entries in
 *   Dashboard → Database → Vault.
 * - After seeding, enable posting via /admin/sosial
 *   (social_post_configs.is_enabled + social_accounts.is_active).
 */
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const SECRET_NAME = 'threads_access_token_asharu_id';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const key =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) {
  console.error(
    'Supabase credentials missing — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (see .env.example).'
  );
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));

const token = await ask('Threads long-lived token (60-day, min 20 chars): ');
if (token.length < 20) {
  console.error('Token looks too short. Aborting (nothing stored).');
  rl.close();
  process.exit(1);
}
const threadsUserId = await ask('Threads numeric user id (from GET /me?fields=id,username): ');
if (!/^\d+$/.test(threadsUserId)) {
  console.error('User id must be numeric. Aborting (nothing stored).');
  rl.close();
  process.exit(1);
}
const expiryRaw = await ask('Token expires in days [60]: ');
rl.close();
const expiryDays = expiryRaw ? Number(expiryRaw) : 60;
if (!Number.isFinite(expiryDays) || expiryDays <= 0 || expiryDays > 90) {
  console.error('Expiry must be 1-90 days. Aborting (nothing stored).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: vaultId, error } = await supabase.rpc('vault_create_secret', {
  p_secret: token,
  p_name: SECRET_NAME
});
if (error || !vaultId) {
  console.error('vault_create_secret failed:', error?.message ?? 'no id returned');
  process.exit(2);
}

const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60_000).toISOString();
const { error: updError } = await supabase
  .from('social_accounts')
  .update({
    threads_user_id: threadsUserId,
    token_suffix: token.slice(-4),
    token_expires_at: expiresAt,
    status: 'active'
  })
  .eq('platform_slug', 'threads')
  .eq('vault_secret_name', SECRET_NAME);
if (updError) {
  console.error('Vault stored, but social_accounts update failed:', updError.message);
  console.error(`Vault id ${vaultId} — update the row manually in Dashboard.`);
  process.exit(3);
}

console.log(`Done. Token stored in Vault as "${SECRET_NAME}" (id ${vaultId}).`);
console.log(`Account @asharu.id → user ${threadsUserId}, suffix …${token.slice(-4)}, expires ${expiresAt}.`);
console.log('Enable posting via /admin/sosial (is_enabled + is_active).');
