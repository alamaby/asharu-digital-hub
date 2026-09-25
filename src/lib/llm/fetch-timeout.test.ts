import { afterEach, describe, expect, it, vi } from 'vitest';
import { LLM_CALL_TIMEOUT_MS, fetchWithTimeout } from './fetch-timeout';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchWithTimeout', () => {
  it('meneruskan response saat fetch selesai sebelum timeout', async () => {
    const fake = { ok: true, status: 200 } as Response;
    vi.stubGlobal('fetch', vi.fn(async () => fake));
    const res = await fetchWithTimeout('https://example.test/x', { method: 'POST' }, 1000);
    expect(res).toBe(fake);
  });

  it('abort + pesan "timeout" saat melewati batas (bukan "aborted" mentah)', async () => {
    vi.useFakeTimers();
    // fetch yang tidak pernah selesai sampai signal di-abort.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('This operation was aborted'));
            });
          })
      )
    );
    const p = fetchWithTimeout('https://slow.test/x', { method: 'POST' }, 50);
    const assertion = expect(p).rejects.toThrow(/timeout setelah/i);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it('error non-abort diteruskan apa adanya (mis. network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    await expect(fetchWithTimeout('https://down.test/x', {}, 1000)).rejects.toThrow('ECONNREFUSED');
  });

  it('default timeout 90s (cukup untuk model lambat, jauh di bawah maxDuration 300s)', () => {
    expect(LLM_CALL_TIMEOUT_MS).toBe(90_000);
  });
});
