#!/usr/bin/env node
/**
 * Seed the Tavily search API key into Supabase Vault (name: `tavily_api_key`).
 * The research pipeline reads it via the service_role-only
 * `vault_decrypt_secret_by_name` RPC — so the key never lives in Vercel env
 * and can be rotated from Dashboard → Vault.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-tavily-key.mjs
 *   # or without env, it prompts interactively:
 *   node scripts/seed-tavily-key.mjs
 *
 * - Reads TAVILY_API_KEY from the environment if present; otherwise prompts.
 * - The secret is NEVER printed. Only a confirmation + Vault id is shown.
 * - Rotation: re-run with a new key — a new Vault entry is created and the
 *   RPC picks the newest (ORDER BY created_at DESC). Delete stale entries in
 *   Dashboard → Database → Vault.
 */
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const SECRET_NAME = 'tavily_api_key';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const key =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) {
  console.error(
    'Supabase credentials missing — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (see .env.example).'
  );
  process.exit(1);
}

let tavilyKey = (process.env.TAVILY_API_KEY ?? '').trim();
if (!tavilyKey) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  tavilyKey = (
    await new Promise((res) => rl.question('Tavily API key (tvly-...): ', (a) => res(a.trim())))
  );
  rl.close();
}
if (!tavilyKey.startsWith('tvly-')) {
  console.error('Key does not look like a Tavily key (expected `tvly-` prefix). Aborting.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: vaultId, error } = await supabase.rpc('vault_create_secret', {
  p_secret: tavilyKey,
  p_name: SECRET_NAME
});
if (error || !vaultId) {
  console.error('vault_create_secret failed:', error?.message ?? 'no id returned');
  process.exit(2);
}

console.log(`Done. Tavily key stored in Vault as "${SECRET_NAME}" (id ${vaultId}).`);
console.log('The research pipeline will pick it up on the next processor run.');
