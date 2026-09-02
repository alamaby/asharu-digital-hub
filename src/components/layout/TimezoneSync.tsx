'use client';

import { useEffect } from 'react';
import { DEFAULT_TIMEZONE } from '@/lib/utils/format';

const TZ_COOKIE = 'USER_TZ';
const TZ_STORAGE = 'device_tz';

/**
 * Detects the device timezone via Intl and persists it in a cookie + localStorage
 * so the server (RSC) can read it on the next request for time formatting.
 * Runs once on mount; no UI. Invalid/missing fallback -> Asia/Jakarta.
 */
export function TimezoneSync() {
  useEffect(() => {
    try {
      const tz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
      // Validate by using it; throws RangeError if invalid.
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
      document.cookie = `${TZ_COOKIE}=${tz}; path=/; max-age=31536000; samesite=lax`;
      try {
        localStorage.setItem(TZ_STORAGE, tz);
      } catch {
        // localStorage may be unavailable (private mode); cookie is enough.
      }
    } catch {
      try {
        document.cookie = `${TZ_COOKIE}=${DEFAULT_TIMEZONE}; path=/; max-age=31536000; samesite=lax`;
      } catch {
        // ignore
      }
    }
  }, []);
  return null;
}
