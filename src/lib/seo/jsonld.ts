import { routing, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { siteConfig } from '@/config/site';
import { localizedPathname } from './paths';
import type { AffiliateProduct, Property } from '@/data/schemas';
import { getSocialLinks } from '@/data/social-links';

export interface BreadcrumbEntry {
  name: string;
  /** Locale-prefixed absolute URL or path key resolved beforehand. */
  url: string;
}

export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: env.siteUrl,
    inLanguage: ['id-ID', 'en-US']
  };
}

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: env.siteUrl,
    logo: `${env.siteUrl}/icon.svg`,
    sameAs: getSocialLinks().map((link) => link.url)
  };
}

export function breadcrumbSchema(entries: BreadcrumbEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.url
    }))
  };
}

/**
 * ItemList over affiliate products. No `Product` markup is emitted because
 * the placeholder data has no verifiable price/offers — see README trade-offs.
 */
export function productListSchema(
  products: AffiliateProduct[],
  locale: Locale
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.name[locale],
      url: product.url
    }))
  };
}

export function propertyListSchema(
  properties: Property[],
  locale: Locale
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: properties.map((property, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: property.title[locale],
      url: localizedPropertyUrl(property.slug, locale)
    }))
  };
}

function localizedPropertyUrl(slug: string, locale: Locale): string {
  return `${env.siteUrl}${localizedPathname('/properties/[slug]', locale, { slug })}`;
}

/** RealEstateListing restricted to data visible on the page; no prices/legal claims. */
export function realEstateListingSchema(
  property: Property,
  locale: Locale
): Record<string, unknown> {
  const additionalProperty: Array<Record<string, unknown>> = [
    {
      '@type': 'PropertyValue',
      name: 'transactionType',
      value: property.transactionType === 'sale' ? 'for sale' : 'for rent'
    }
  ];
  if (property.buildingAreaSqm !== undefined) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'buildingAreaSqm',
      value: property.buildingAreaSqm,
      unitText: 'm2'
    });
  }
  if (property.landAreaSqm !== undefined) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'landAreaSqm',
      value: property.landAreaSqm,
      unitText: 'm2'
    });
  }
  if (property.bedrooms !== undefined) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'bedrooms',
      value: property.bedrooms
    });
  }
  if (property.bathrooms !== undefined) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'bathrooms',
      value: property.bathrooms
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.title[locale],
    url: localizedPropertyUrl(property.slug, locale),
    image: `${env.siteUrl}${property.image}`,
    description: property.description[locale],
    location: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressRegion: property.location[locale],
        addressCountry: 'ID'
      }
    },
    additionalProperty
  };
}

export const defaultLocale = routing.defaultLocale;
