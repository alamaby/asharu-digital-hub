import type { MetadataRoute } from 'next';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';
import { localizedPathname } from '@/lib/seo/paths';
import { getPublishedProperties } from '@/data/properties';
import { getAllPublishedSlugs } from '@/lib/articles/public';

interface SitemapEntry {
  path: string;
  params?: Record<string, string>;
}

const staticPaths: SitemapEntry[] = [
  { path: '/' },
  { path: '/products' },
  { path: '/properties' },
  { path: '/artikel' },
  { path: '/about' },
  { path: '/privacy-policy' },
  { path: '/affiliate-disclosure' },
  ...getPublishedProperties().map((property) => ({
    path: '/properties/[slug]',
    params: { slug: property.slug }
  }))
];

function entry(
  path: string,
  params: Record<string, string> | undefined,
  lastModified: Date,
  priority: number
): MetadataRoute.Sitemap[number][] {
  return routing.locales.map((locale) => ({
    url: `${env.siteUrl}${localizedPathname(path, locale as Locale, params)}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority,
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
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fallbackModified = new Date();
  const propertyBySlug = new Map(
    getPublishedProperties().map((property) => [property.slug, property])
  );

  const out: MetadataRoute.Sitemap = [];
  for (const { path, params } of staticPaths) {
    const slug = params?.slug;
    const property = slug ? propertyBySlug.get(slug) : undefined;
    const lastModified = property?.updatedAt
      ? new Date(`${property.updatedAt}T00:00:00+07:00`)
      : fallbackModified;
    const priority =
      path === '/'
        ? 1
        : slug === 'dijual-rumah-kamarasan-bandung-timur'
          ? 0.9
          : 0.7;
    out.push(...entry(path, params, lastModified, priority));
  }

  // Artikel published: 1 URL per locale per slug (best-effort — gagal → dilewati).
  try {
    const slugs = await getAllPublishedSlugs();
    for (const a of slugs) {
      out.push(
        ...entry(
          '/artikel/[slug]',
          { slug: a.slug },
          a.published_at ? new Date(a.published_at) : fallbackModified,
          0.8
        )
      );
    }
  } catch {
    // Sitemap tetap valid tanpa artikel (mis. Supabase belum dikonfigurasi).
  }

  return out;
}
