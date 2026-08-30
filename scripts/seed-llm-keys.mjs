#!/usr/bin/env node
/**
 * Seed LLM provider keys into Supabase Vault (interactive, no secret logged).
 * Reads SUPABASE_URL + SUPABASE_SECRET_KEY (or legacy SERVICE_ROLE) from env.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-llm-keys.mjs
 *
 * Idempotent: re-running with the same key updates the existing row
 * (migrating a plaintext api_key_encrypted row into Vault and clearing it).
 */
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    '',
  { auth: { persistSession: false } }
);

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) {
  return new Promise((res) => rl.question(q, (a) => res(a)));
}

const slug = (await ask('Provider slug (naraya/openrouter/gemini/cloudflare): ')).trim();
const rawKey = (await ask('API key: ')).trim();
const priority = Number((await ask('Priority (0 = highest, default 0): ')).trim() || '0');
rl.close();

if (!slug || !rawKey) {
  console.error('Slug and key are required.');
  process.exit(1);
}

const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);

const { data: provider } = await supabase.from('llm_providers').select('id').eq('slug', slug).single();
if (!provider) {
  console.error(`Provider ${slug} not found.`);
  process.exit(2);
}

// Create Vault secret via the public RPC wrapper (SECURITY DEFINER, service_role only).
const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', {
  p_secret: rawKey,
  p_name: `llm_${slug}_${hash}`
});
if (vaultError) {
  console.error('vault_create_secret failed:', vaultError.message ?? JSON.stringify(vaultError));
  process.exit(3);
}

// Upsert by key_hash: insert new, or migrate existing row into Vault
// (clearing any plaintext api_key_encrypted left by the old fallback).
const { error: upsertError } = await supabase
  .from('llm_provider_keys')
  .upsert(
    {
      provider_id: provider.id,
      vault_secret_id: vaultId,
      key_hash: hash,
      api_key_encrypted: null,
      priority,
      is_active: true
    },
    { onConflict: 'key_hash' }
  );

if (upsertError) {
  console.error('Insert failed:', upsertError.message);
  // Roll back the orphaned vault secret so re-runs don't leak entries.
  await supabase.rpc('vault_delete_secret', { p_id: vaultId }).catch(() => {});
  process.exit(4);
}

console.log(`Done. Key hash ${hash} stored in Vault for ${slug} (priority ${priority}).`);
