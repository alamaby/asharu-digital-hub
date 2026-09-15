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
  robots?: { index: boolean; follow: boolean };
  /**
   * Opsi khusus halaman artikel: emit `og:type article` +
   * `article:published_time`/`modified_time` + gambar OG/Twitter dengan alt.
   * Halaman non-artikel tetap default `website`.
   */
  article?: {
    publishedTime: string;
    modifiedTime: string;
    /** Gambar penutup absolut + alt (judul artikel). */
    ogImage?: { url: string; alt: string };
  };
}

/** Meta Business domain verification token for `asharu.id` (public by design). */
export const FACEBOOK_DOMAIN_VERIFICATION_TOKEN = 'wt9cbx9npb6njy0lcqrpe85dal7pmz';

export function buildMetadata({
  locale,
  path,
  title,
  description,
  params,
  robots,
  article
}: BuildMetadataInput): Metadata {
  const canonicalPath = localizedPathname(path, locale, params);
  const canonical = `${env.siteUrl}${canonicalPath}`;
  const ogImage = article?.ogImage;

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
    openGraph: article
      ? {
          type: 'article',
          url: canonical,
          title,
          description,
          siteName: 'Asharu',
          locale: locale === 'id' ? 'id_ID' : 'en_US',
          alternateLocale: locale === 'id' ? 'en_US' : 'id_ID',
          publishedTime: article.publishedTime,
          modifiedTime: article.modifiedTime,
          ...(ogImage ? { images: [{ url: ogImage.url, alt: ogImage.alt }] } : {})
        }
      : {
          type: 'website',
          url: canonical,
          title,
          description,
          siteName: 'Asharu',
          locale: locale === 'id' ? 'id_ID' : 'en_US',
          alternateLocale: locale === 'id' ? 'en_US' : 'id_ID',
          ...(ogImage ? { images: [{ url: ogImage.url, alt: ogImage.alt }] } : {})
        },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage.url, alt: ogImage.alt }] } : {})
    },
    robots: robots ?? { index: true, follow: true },
    other: {
      'facebook-domain-verification': FACEBOOK_DOMAIN_VERIFICATION_TOKEN
    }
  };
}

/**
 * Potong teks di batas kata terakhir sebelum `max` karakter — tidak
 * memotong tengah kata (untuk `meta description` / `og:description`).
 * Teks lebih pendek dari `max` dikembalikan apa adanya.
 */
export function truncateAtWord(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace <= 0) return cut.slice(0, max);
  return cut.slice(0, lastSpace).trimEnd();
}
