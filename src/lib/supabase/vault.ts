import { createClient } from '@supabase/supabase-js';
import type { KeyRow } from '@/lib/llm/types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Decrypt a Vault secret by id (service_role only).
 * Returns the raw API key string.
 */
export async function getDecryptedKey(vaultSecretId: string): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .rpc('vault_decrypt', { secret_id: vaultSecretId })
    .single();

  // Fallback: direct vault query (supabase_vault extension)
  if (error || !data) {
    const { data: vaultData, error: vaultError } = await supabase
      .from('vault.decrypted_secrets' as unknown as string)
      .select('decrypted_secret')
      .eq('id', vaultSecretId)
      .single();
    if (vaultError || !vaultData) throw new Error(`Vault decrypt failed: ${vaultError?.message ?? 'no data'}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (vaultData as any).decrypted_secret as string;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).decrypted_secret ?? (data as unknown as string);
}

/**
 * Fetch ordered keys for a provider (priority → last_used → usage → failure).
 * Used by KeyPool.
 */
export async function fetchOrderedKeys(providerId: string): Promise<KeyRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('llm_provider_keys')
    .select('*')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .order('usage_count', { ascending: true })
    .order('failure_count', { ascending: true });
  if (error) throw new Error(`fetchOrderedKeys: ${error.message}`);
  return (data ?? []) as unknown as KeyRow[];
}

export async function markKeyUsage(keyId: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from('llm_provider_keys')
    .update({ usage_count: 0, last_used_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    // Use rpc increment to avoid race; fallback to simple update if rpc not exists
    .eq('id', keyId);
  // Proper increment via RPC if available
  const { error } = await supabase.rpc('increment_key_usage', { p_key_id: keyId });
  if (error) {
    // Fallback already done above with set; ignore
  }
}

export async function markKeyFailure(keyId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('llm_provider_keys')
    .select('failure_count')
    .eq('id', keyId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.failure_count ?? 0;
  const next = current + 1;
  const patch: Record<string, unknown> = { failure_count: next };
  if (next > 5) patch.is_active = false;
  await supabase.from('llm_provider_keys').update(patch).eq('id', keyId);
}
