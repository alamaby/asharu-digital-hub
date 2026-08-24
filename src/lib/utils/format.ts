import type { Locale } from '@/i18n/routing';

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatArea(value: number, locale: Locale): string {
  return `${formatNumber(value, locale)} m²`;
}

export function formatDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', {
    dateStyle: 'long'
  }).format(new Date(isoDate));
}
