import { getServiceClient } from '@/lib/supabase/service';
import { ImageHttpError } from './types';
import type { ImageKeyRow, ImageProviderRow } from './types';

/**
 * ImageKeyPool — round-robin + fallback + circuit breaker, tiru llm/key-pool.ts.
 * Lapis 1 (di sini): key berikutnya dalam 1 provider (primary → backup-N).
 * Lapis 2 (di worker): provider berikutnya sesuai prioritas.
 * Hanya 401/403/429 yang menyalahkan key; 5xx dan error konten tidak.
 */

async function decryptByName(vaultSecretName: string): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('vault_decrypt_secret_by_name', {
    p_name: vaultSecretName
  });
  if (error || !data) throw new Error(`Vault decrypt by name failed: ${error?.message ?? 'no data'}`);
  return data as string;
}

async function getApiKeyForImageRow(row: ImageKeyRow): Promise<string> {
  try {
    return await decryptByName(row.vault_secret_name);
  } catch {
    if (!row.vault_secret_id) throw new Error(`No key material for image key ${row.id}`);
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('vault_decrypt_secret', { p_id: row.vault_secret_id });
    if (error || !data) throw new Error(`Vault decrypt failed for image key ${row.id}`);
    return data as string;
  }
}

export async function fetchOrderedImageKeys(providerId: string): Promise<ImageKeyRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('image_provider_keys')
    .select('*')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .order('usage_count', { ascending: true })
    .order('failure_count', { ascending: true });
  if (error) throw new Error(`fetchOrderedImageKeys: ${error.message}`);
  return (data ?? []) as unknown as ImageKeyRow[];
}

export async function markImageKeyUsage(keyId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('image_provider_keys')
    .select('usage_count')
    .eq('id', keyId)
    .single();
  if (error) throw new Error(`markImageKeyUsage select: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.usage_count ?? 0;
  const { error: updError } = await supabase
    .from('image_provider_keys')
    .update({ usage_count: current + 1, last_used_at: new Date().toISOString() })
    .eq('id', keyId);
  if (updError) throw new Error(`markImageKeyUsage update: ${updError.message}`);
}

export async function markImageKeyFailure(keyId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('image_provider_keys')
    .select('failure_count')
    .eq('id', keyId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (data as any)?.failure_count ?? 0;
  const next = current + 1;
  const patch: Record<string, unknown> = { failure_count: next };
  if (next > 5) patch.is_active = false;
  await supabase.from('image_provider_keys').update(patch).eq('id', keyId);
}

export class ImageKeyPool {
  constructor(private provider: ImageProviderRow) {}

  async withFallback<T>(
    fn: (apiKey: string, keyRow: ImageKeyRow) => Promise<T>
  ): Promise<{ result: T; keyRow: ImageKeyRow }> {
    const keys = await fetchOrderedImageKeys(this.provider.id);
    let lastError: unknown;
    for (const row of keys) {
      let apiKey: string;
      try {
        apiKey = await getApiKeyForImageRow(row);
      } catch (e) {
        lastError = e;
        continue;
      }
      try {
        const result = await fn(apiKey, row);
        await markImageKeyUsage(row.id);
        return { result, keyRow: row };
      } catch (e) {
        lastError = e;
        if (e instanceof ImageHttpError && [401, 403, 429].includes(e.status)) {
          await markImageKeyFailure(row.id);
        }
      }
    }
    throw lastError ?? new Error(`No keys available for image provider ${this.provider.slug}`);
  }
}
