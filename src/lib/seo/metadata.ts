import type { Metadata } from 'next';
import { routing, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { localizedPathname } from './paths';

export interface BuildMetadataInput {
  locale: Locale;
  /** Internal pathname, e.g. `/products` or `/properties/[slug]`. */
  path: string;
  title: string;
  description: string;
  params?: Record<string, string>;
}

export function buildMetadata({
  locale,
  path,
  title,
  description,
  params
}: BuildMetadataInput): Metadata {
  const canonicalPath = localizedPathname(path, locale, params);
  const canonical = `${env.siteUrl}${canonicalPath}`;

  return {
    metadataBase: new URL(env.siteUrl),
    title,
    description,
    alternates: {
      canonical,
      languages: {
        id: `${env.siteUrl}${localizedPathname(path, 'id', params)}`,
        en: `${env.siteUrl}${localizedPathname(path, 'en', params)}`,
        'x-default': `${env.siteUrl}${localizedPathname(path, routing.defaultLocale, params)}`
      }
    },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      siteName: 'Asharu',
      locale: locale === 'id' ? 'id_ID' : 'en_US',
      alternateLocale: locale === 'id' ? 'en_US' : 'id_ID'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description
    },
    robots: { index: true, follow: true }
  };
}
