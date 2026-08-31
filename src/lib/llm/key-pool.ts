import type { KeyRow, ProviderRow } from './types';
import { LLMHttpError } from './types';
import { fetchOrderedKeys, getApiKeyForRow, markKeyFailure, markKeyUsage } from '@/lib/supabase/vault';

export interface AcquiredKey {
  row: KeyRow;
  apiKey: string;
}

/**
 * KeyPool — round-robin + fallback + circuit breaker.
 * DB-driven via llm_provider_keys priority/last_used_at.
 */
export class KeyPool {
  constructor(private provider: ProviderRow) {}

  async acquire(): Promise<AcquiredKey | null> {
    const keys = await fetchOrderedKeys(this.provider.id);
    if (keys.length === 0) return null;
    const row = keys[0]!;
    const apiKey = await getApiKeyForRow(row);
    await markKeyUsage(row.id);
    return { row, apiKey };
  }

  /**
   * Try keys in order until one succeeds (fallback routing).
   * `fn` receives the decrypted apiKey and should throw on 429/5xx to trigger fallback.
   */
  async withFallback<T>(
    fn: (apiKey: string, keyRow: KeyRow) => Promise<T>
  ): Promise<{ result: T; keyRow: KeyRow }> {
    const keys = await fetchOrderedKeys(this.provider.id);
    let lastError: unknown;
    for (const row of keys) {
      let apiKey: string;
      try {
        apiKey = await getApiKeyForRow(row);
      } catch (e) {
        lastError = e;
        continue;
      }
      try {
        const result = await fn(apiKey, row);
        await markKeyUsage(row.id);
        return { result, keyRow: row };
      } catch (e) {
        lastError = e;
        // Only credential/limit errors blame the key (circuit breaker input);
        // content validation failures (bad JSON, shape, max_chars) and 5xx
        // outages are not the key's fault and must not deactivate it.
        if (e instanceof LLMHttpError && [401, 403, 429].includes(e.status)) {
          await markKeyFailure(row.id);
        }
        // Continue to next key
      }
    }
    throw lastError ?? new Error(`No keys available for ${this.provider.slug}`);
  }
}
