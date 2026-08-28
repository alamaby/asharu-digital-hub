import type { KeyRow } from '@/lib/llm/types';
import { getServiceClient } from './service';

/**
 * Decrypt a Vault secret by id (service_role only).
 * Supabase Vault exposes `vault.decrypted_secrets` view for service_role.
 */
export async function getDecryptedKey(vaultSecretId: string): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('vault.decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', vaultSecretId)
    .single();
  if (error || !data) throw new Error(`Vault decrypt failed: ${error?.message ?? 'no data'}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).decrypted_secret as string;
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
  const { data, error } = await supabase
    .from('llm_provider_keys')
    .select('usage_count')
    .eq('id', keyId)
    .single();
  if (error) throw new Error(`markKeyUsage select: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.usage_count ?? 0;
  const { error: updError } = await supabase
    .from('llm_provider_keys')
    .update({ usage_count: current + 1, last_used_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq('id', keyId);
  if (updError) throw new Error(`markKeyUsage update: ${updError.message}`);
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
