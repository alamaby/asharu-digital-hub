import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';

type PathnameMap = Record<string, string | Partial<Record<Locale, string>>>;

/**
 * Resolves an internal pathname (e.g. `/products`, `/properties/[slug]`)
 * to the concrete, locale-prefixed path (e.g. `/id/produk`).
 * Pure function — used for canonical URLs, hreflang alternates and the
 * sitemap so those never depend on runtime request context.
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
  return `/${locale}${result}`;
}
