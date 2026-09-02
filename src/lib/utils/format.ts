import type { Locale } from '@/i18n/routing';

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatArea(value: number, locale: Locale): string {
  return `${formatNumber(value, locale)} m2`;
}

export function formatDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', {
    dateStyle: 'long'
  }).format(new Date(isoDate));
}

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/**
 * Resolve a timezone with fallbacks: user pref -> cookie (device) -> default.
 * Invalid IANA names fall back to DEFAULT_TIMEZONE.
 */
export function resolveTimezone(pref?: string | null, deviceCookie?: string | null): string {
  const candidates = [pref, deviceCookie, DEFAULT_TIMEZONE].filter(Boolean) as string[];
  for (const tz of candidates) {
    try {
      // Validate by formatting; throws RangeError for invalid timeZone.
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
      return tz;
    } catch {
      // try next
    }
  }
  return DEFAULT_TIMEZONE;
}

/**
 * Format an ISO timestamp using the given locale + timezone.
 * Returns e.g. "02 Sep 13:05" (id-ID) or "Sep 2, 1:05 PM" (en-US).
 */
export function formatDateTime(iso: string, locale: Locale, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

/**
 * Format an ISO timestamp with seconds (for log entries).
 */
export function formatDateTimeSeconds(iso: string, locale: Locale, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 19).replace('T', ' ');
  }
}
