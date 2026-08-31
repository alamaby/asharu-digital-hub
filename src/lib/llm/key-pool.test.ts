import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock Vault helpers so KeyPool is testable without Supabase.
const mockFetchOrderedKeys = vi.fn();
const mockGetApiKeyForRow = vi.fn();
const mockMarkUsage = vi.fn();
const mockMarkFailure = vi.fn();

vi.mock('@/lib/supabase/vault', () => ({
  fetchOrderedKeys: (...args: unknown[]) => mockFetchOrderedKeys(...args),
  getApiKeyForRow: (...args: unknown[]) => mockGetApiKeyForRow(...args),
  markKeyUsage: (...args: unknown[]) => mockMarkUsage(...args),
  markKeyFailure: (...args: unknown[]) => mockMarkFailure(...args)
}));

import { KeyPool } from './key-pool';
import { LLMHttpError } from './types';
import type { ProviderRow } from './types';

const provider: ProviderRow = {
  id: 'prov-1',
  slug: 'naraya',
  display_name: 'Naraya',
  base_url: 'https://router.bynara.id/v1',
  is_active: true,
  priority: 10
};

function keyRow(id: string, priority: number): import('./types').KeyRow {
  return {
    id,
    provider_id: provider.id,
    vault_secret_id: `vault-${id}`,
    key_hash: `hash-${id}`,
    priority,
    usage_count: 0,
    failure_count: 0,
    last_used_at: null,
    is_active: true
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KeyPool', () => {
  it('acquires the first ordered key', async () => {
    mockFetchOrderedKeys.mockResolvedValue([keyRow('k1', 0), keyRow('k2', 1)]);
    mockGetApiKeyForRow.mockResolvedValue('sk-test');
    const pool = new KeyPool(provider);
    const acquired = await pool.acquire();
    expect(acquired?.row.id).toBe('k1');
    expect(mockMarkUsage).toHaveBeenCalledWith('k1');
  });

  it('falls back to next key on 429 (blames the key)', async () => {
    mockFetchOrderedKeys.mockResolvedValue([keyRow('k1', 0), keyRow('k2', 1)]);
    mockGetApiKeyForRow.mockResolvedValue('sk-test');
    const pool = new KeyPool(provider);
    const result = await pool.withFallback(async (apiKey, row) => {
      if (row.id === 'k1') throw new LLMHttpError(429, 'rate limited');
      return `ok:${apiKey}`;
    });
    expect(result.keyRow.id).toBe('k2');
    expect(mockMarkFailure).toHaveBeenCalledWith('k1');
    expect(mockMarkUsage).toHaveBeenCalledWith('k2');
  });

  it('throws if no keys available', async () => {
    mockFetchOrderedKeys.mockResolvedValue([]);
    const pool = new KeyPool(provider);
    await expect(pool.withFallback(async () => 'x')).rejects.toThrow(/No keys/);
  });

  it('circuit breaker: 401 invalid key is blamed via markKeyFailure', async () => {
    const k = keyRow('k1', 0);
    k.failure_count = 5;
    mockFetchOrderedKeys.mockResolvedValue([k]);
    mockGetApiKeyForRow.mockResolvedValue('sk-test');
    const pool = new KeyPool(provider);
    await expect(
      pool.withFallback(async () => {
        throw new LLMHttpError(401, 'unauthorized');
      })
    ).rejects.toThrow();
    expect(mockMarkFailure).toHaveBeenCalledWith('k1');
  });

  it('5xx outages and content-validation errors do NOT blame the key', async () => {
    mockFetchOrderedKeys.mockResolvedValue([keyRow('k1', 0), keyRow('k2', 1)]);
    mockGetApiKeyForRow.mockResolvedValue('sk-test');
    const pool = new KeyPool(provider);
    // 503 = provider outage; must not deactivate the key.
    await pool.withFallback(async (apiKey, row) => {
      if (row.id === 'k1') throw new LLMHttpError(503, 'unavailable');
      return `ok:${apiKey}`;
    });
    expect(mockMarkFailure).not.toHaveBeenCalled();
    // Plain Error = content validation (bad JSON/shape/max_chars); not the key's fault.
    await pool.withFallback(async (apiKey, row) => {
      if (row.id === 'k1') throw new Error('Thread shape invalid');
      return `ok:${apiKey}`;
    });
    expect(mockMarkFailure).not.toHaveBeenCalled();
  });
});
