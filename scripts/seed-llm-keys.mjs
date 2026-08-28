#!/usr/bin/env node
/**
 * Seed LLM provider keys into Vault (interactive, no secret logged).
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env.
 * Usage: node scripts/seed-llm-keys.mjs
 */
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) {
  return new Promise((res) => rl.question(q, (a) => res(a)));
}

const slug = (await ask('Provider slug (naraya/openrouter/gemini/cloudflare): ')).trim();
const rawKey = (await ask('API key (input hidden not supported, clear after): ')).trim();
const priority = Number((await ask('Priority (0 = highest, default 0): ')).trim() || '0');

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

// Create Vault secret (supabase vault)
const { data: secret, error: vaultError } = await supabase.rpc('vault_create_secret', {
  p_secret: rawKey,
  p_name: `llm_${slug}_${hash}`,
  p_description: `LLM key for ${slug}`
});

// Fallback: direct insert with vault extension
let vaultId = secret;
if (vaultError) {
  console.error('vault_create_secret failed, trying direct vault insert:', vaultError.message);
  const { data, error } = await supabase.from('vault.secrets').insert({ secret: rawKey, name: `llm_${slug}_${hash}` }).select('id').single();
  if (error) {
    console.error('Vault insert failed:', error.message);
    process.exit(3);
  }
  vaultId = data.id;
}

const { error: insertError } = await supabase.from('llm_provider_keys').insert({
  provider_id: provider.id,
  vault_secret_id: vaultId,
  key_hash: hash,
  priority,
  is_active: true
});

if (insertError) {
  console.error('Insert failed:', insertError.message);
  process.exit(4);
}

console.log(`Done. Key hash ${hash} inserted for ${slug} (priority ${priority}). Vault secret ${vaultId}.`);
rl.close();
