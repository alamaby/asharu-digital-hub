import type { KeyRow, ModelRow } from '@/lib/llm/types';
import { getServiceClient } from './service';
import {
  DEFAULT_FAILURE_THRESHOLD,
  incrementFailureCounter,
  incrementUsageCounter
} from './counters';
import { reportError } from '@/lib/notifications/error-events';

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
  await incrementUsageCounter('llm_provider_keys', keyId);
}

export async function markKeyFailure(keyId: string): Promise<void> {
  const next = await incrementFailureCounter('llm_provider_keys', keyId);
  if (next > DEFAULT_FAILURE_THRESHOLD) {
    try {
      await reportError(getServiceClient(), {
        category: 'llm', source: 'markKeyFailure', severity: 'warning',
        message: `LLM provider key auto-disabled setelah ${next} kegagalan (key_id ${keyId.slice(0, 8)})`,
        details: { key_id: keyId }
      });
    } catch { /* swallow */ }
  }
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
  await incrementUsageCounter('llm_models', modelId);
}

export async function markModelFailure(modelId: string): Promise<void> {
  const next = await incrementFailureCounter('llm_models', modelId);
  if (next > DEFAULT_FAILURE_THRESHOLD) {
    try {
      await reportError(getServiceClient(), {
        category: 'llm', source: 'markModelFailure', severity: 'warning',
        message: `LLM model auto-disabled setelah ${next} kegagalan (model_id ${modelId.slice(0, 8)})`,
        details: { model_id: modelId }
      });
    } catch { /* swallow */ }
  }
}
