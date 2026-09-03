import type { KeyRow, ModelRow } from '@/lib/llm/types';
import { getServiceClient } from './service';

/**
 * Decrypt a Vault secret by id (service_role only).
 * Uses the public `vault_decrypt_secret` RPC wrapper (SECURITY DEFINER) —
 * the `vault` schema itself is not exposed via PostgREST.
 */
export async function getDecryptedKey(vaultSecretId: string): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('vault_decrypt_secret', { p_id: vaultSecretId });
  if (error || !data) throw new Error(`Vault decrypt failed: ${error?.message ?? 'no data'}`);
  return data as string;
}

/**
 * Get API key for a KeyRow — tries Vault, falls back to api_key_encrypted column.
 */
export async function getApiKeyForRow(row: KeyRow): Promise<string> {
  if (row.vault_secret_id) {
    try {
      return await getDecryptedKey(row.vault_secret_id);
    } catch {
      // Fall through to direct column
    }
  }
  // Fallback: direct column (when Vault not exposed)
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('llm_provider_keys')
    .select('api_key_encrypted')
    .eq('id', row.id)
    .single();
  if (error || !data) throw new Error(`No key material for ${row.id}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encrypted = (data as any).api_key_encrypted as string | null;
  if (!encrypted) throw new Error(`No api_key_encrypted for ${row.id}`);
  return encrypted;
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

export async function fetchOrderedModels(providerId: string): Promise<ModelRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('llm_models')
    .select('*')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .order('usage_count', { ascending: true })
    .order('failure_count', { ascending: true });
  if (error) throw new Error(`fetchOrderedModels: ${error.message}`);
  return (data ?? []) as unknown as ModelRow[];
}

export async function markModelUsage(modelId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('llm_models').select('usage_count').eq('id', modelId).single();
  if (error) throw new Error(`markModelUsage select: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.usage_count ?? 0;
  const { error: updError } = await supabase
    .from('llm_models')
    .update({ usage_count: current + 1, last_used_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq('id', modelId);
  if (updError) throw new Error(`markModelUsage update: ${updError.message}`);
}

export async function markModelFailure(modelId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase.from('llm_models').select('failure_count').eq('id', modelId).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.failure_count ?? 0;
  const next = current + 1;
  const patch: Record<string, unknown> = { failure_count: next };
  if (next > 5) patch.is_active = false;
  await supabase.from('llm_models').update(patch).eq('id', modelId);
}
