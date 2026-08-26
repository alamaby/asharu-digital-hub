import type { MetadataRoute } from 'next';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';
import { localizedPathname } from '@/lib/seo/paths';
import { getPublishedProperties } from '@/data/properties';

interface SitemapEntry {
  path: string;
  params?: Record<string, string>;
}

const staticPaths: SitemapEntry[] = [
  { path: '/' },
  { path: '/products' },
  { path: '/properties' },
  { path: '/about' },
  { path: '/privacy-policy' },
  { path: '/affiliate-disclosure' },
  ...getPublishedProperties().map((property) => ({
    path: '/properties/[slug]',
    params: { slug: property.slug }
  }))
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return staticPaths.flatMap(({ path, params }) =>
    routing.locales.map((locale) => ({
      url: `${env.siteUrl}${localizedPathname(path, locale as Locale, params)}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: path === '/' ? 1 : 0.7,
      alternates: {
        languages: {
          id: `${env.siteUrl}${localizedPathname(path, 'id' as Locale, params)}`,
          en: `${env.siteUrl}${localizedPathname(path, 'en' as Locale, params)}`,
          'x-default': `${env.siteUrl}${localizedPathname(
            path,
            routing.defaultLocale as Locale,
            params
          )}`
        }
      }
    }))
  );
}
