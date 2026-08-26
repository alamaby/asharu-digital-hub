import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';

type PathnameMap = Record<string, string | Partial<Record<Locale, string>>>;

/**
 * Resolves an internal pathname (e.g. `/products`, `/properties/[slug]`)
 * to the concrete, locale-prefixed path (e.g. `/id/produk`). Output never
 * carries a trailing slash so canonical URLs match the served URL exactly.
 */
export function localizedPathname(
  internal: string,
  locale: Locale,
  params?: Record<string, string>
): string {
  const template = (routing.pathnames as PathnameMap)[internal];
  const localized =
    typeof template === 'string' ? template : (template?.[locale] ?? internal);

  let result = localized;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(`[${key}]`, encodeURIComponent(value));
    }
  }

  const fullPath = `/${locale}${result}`;
  const trimmed = fullPath.replace(/\/+$/, '');
  return trimmed.length > `/${locale}`.length ? trimmed : `/${locale}`;
}
