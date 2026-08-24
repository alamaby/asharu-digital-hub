export const CONSENT_STORAGE_KEY = 'asharu.consent.v1';
export const CONSENT_OPEN_EVENT = 'asharu:consent:open';
export const CONSENT_CHANGE_EVENT = 'asharu:consent:change';

export interface ConsentState {
  analytics: boolean;
  updatedAt: string;
}

export type ConsentStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readConsent(storage: ConsentStorage): ConsentState | null {
  try {
    const raw = storage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ConsentState).analytics === 'boolean'
    ) {
      const state = parsed as ConsentState;
      return { analytics: state.analytics, updatedAt: state.updatedAt ?? '' };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeConsent(
  storage: ConsentStorage,
  analytics: boolean
): ConsentState {
  const state: ConsentState = {
    analytics,
    updatedAt: new Date().toISOString()
  };
  try {
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode) — keep decision in memory only.
  }
  return state;
}
