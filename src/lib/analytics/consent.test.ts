import { describe, expect, it, vi } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  readConsent,
  writeConsent,
  type ConsentStorage
} from './consent';

function memoryStorage(): ConsentStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  };
}

describe('consent storage', () => {
  it('round-trips a consent decision', () => {
    const storage = memoryStorage();
    writeConsent(storage, true);
    expect(readConsent(storage)).toMatchObject({ analytics: true });
  });

  it('returns null when nothing was stored', () => {
    expect(readConsent(memoryStorage())).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    const storage = memoryStorage();
    storage.data.set(CONSENT_STORAGE_KEY, '{not json');
    expect(readConsent(storage)).toBeNull();
  });

  it('returns null when analytics flag is missing or non-boolean', () => {
    const storage = memoryStorage();
    storage.data.set(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: 'yes' }));
    expect(readConsent(storage)).toBeNull();
  });

  it('survives a throwing storage (private mode)', () => {
    const failing = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('quota');
      })
    };
    const state = writeConsent(failing, false);
    expect(state.analytics).toBe(false);
  });
});
