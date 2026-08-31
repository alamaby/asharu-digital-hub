#!/usr/bin/env node
/**
 * Create the pg_cron secret (`asharu_cron_secret`) in Supabase Vault.
 * The processor endpoint (/api/content/process) only accepts
 * `Authorization: Bearer <CRON_SECRET>` — this script stores that secret in
 * Vault so the pg_cron job can read it, and prints it ONCE so the same value
 * can be copied into the Vercel env (`CRON_SECRET`).
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-cron-secret.mjs
 *
 * - If CRON_SECRET is set in the env, that exact value is stored (guarantees
 *   Vault == Vercel). Otherwise a 32-byte hex secret is generated.
 * - Rotation: re-run after replacing CRON_SECRET in the env — a new Vault
 *   entry is created and the cron job picks the newest one
 *   (ORDER BY created_at DESC). Delete stale entries via Dashboard → Vault.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const SECRET_NAME = 'asharu_cron_secret';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const key =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) {
  console.error(
    'Supabase credentials missing — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (see .env.example).'
  );
  process.exit(1);
}

const secret =
  process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length >= 10
    ? process.env.CRON_SECRET.trim()
    : randomBytes(32).toString('hex');

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', {
  p_secret: secret,
  p_name: SECRET_NAME
});
if (vaultError || !vaultId) {
  console.error(
    'vault_create_secret failed:',
    vaultError?.message ?? JSON.stringify(vaultError) ?? 'no id returned'
  );
  process.exit(2);
}

console.log(`Secret stored in Vault as "${SECRET_NAME}" (id ${vaultId}).`);
console.log('');
console.log('CRON_SECRET (copy to Vercel Environment Variables → Production):');
console.log(secret);
console.log('');
console.log('Next steps:');
console.log('  1. Set the value above as CRON_SECRET in Vercel (Production).');
console.log('  2. Apply supabase/migrations/20260831000001_processor_cron_bearer.sql to the DB.');
console.log('  3. Redeploy / wait for the route fix deploy.');
