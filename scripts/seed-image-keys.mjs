#!/usr/bin/env node
/**
 * Seed image provider keys into Supabase Vault (interactive, no secret logged).
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY from env.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-image-keys.mjs
 *
 * Prompts: provider slug, label (primary/backup-N), API key, priority,
 *          Cloudflare account id (khusus cloudflare).
 * Idempotent per key_hash (onConflict key_hash → update).
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

const slug = (await ask('Image provider slug (pixazo/cloudflare/pollinations/gemini/bynara): ')).trim();
const label = ((await ask('Label (primary/backup-1/..., default primary): ')).trim() || 'primary');
const rawKey = (await ask('API key: ')).trim();
const priority = Number((await ask('Priority (0 = highest, default 0): ')).trim() || '0');
const accountId = slug === 'cloudflare'
  ? (await ask('Cloudflare account id: ')).trim()
  : '';
rl.close();

if (!slug || !rawKey) {
  console.error('Slug and key are required.');
  process.exit(1);
}
if (slug === 'cloudflare' && !accountId) {
  console.error('Cloudflare requires an account id.');
  process.exit(1);
}

const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
const suffix = rawKey.slice(-4);

const { data: provider } = await supabase.from('image_providers').select('id').eq('slug', slug).single();
if (!provider) {
  console.error(`Image provider ${slug} not found.`);
  process.exit(2);
}

if (accountId) {
  const { error: cfgError } = await supabase
    .from('image_providers')
    .update({ config: { account_id: accountId } })
    .eq('slug', slug);
  if (cfgError) {
    console.error('Provider config update failed:', cfgError.message);
    process.exit(5);
  }
}

const vaultName = `img_${slug}_${label}_${hash}`;
const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', {
  p_secret: rawKey,
  p_name: vaultName
});
if (vaultError) {
  console.error('vault_create_secret failed:', vaultError.message ?? JSON.stringify(vaultError));
  process.exit(3);
}

const { error: upsertError } = await supabase
  .from('image_provider_keys')
  .upsert(
    {
      provider_id: provider.id,
      vault_secret_id: vaultId,
      vault_secret_name: vaultName,
      key_hash: hash,
      key_suffix: suffix,
      label,
      priority,
      is_active: true
    },
    { onConflict: 'key_hash' }
  );

if (upsertError) {
  console.error('Insert failed:', upsertError.message);
  await supabase.rpc('vault_delete_secret', { p_id: vaultId }).catch(() => {});
  process.exit(4);
}

console.log(`Done. Key hash ${hash} (label ${label}) stored in Vault for image provider ${slug} (priority ${priority}).`);
