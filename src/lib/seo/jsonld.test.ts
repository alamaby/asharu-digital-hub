import { describe, expect, it } from 'vitest';
import {
  breadcrumbSchema,
  organizationSchema,
  productListSchema,
  propertyListSchema,
  realEstateListingSchema,
  websiteSchema
} from './jsonld';
import { affiliateProducts } from '@/data/affiliate-products';
import { properties } from '@/data/properties';

describe('JSON-LD builders', () => {
  it('website schema points at the production domain', () => {
    expect(websiteSchema()).toMatchObject({
      '@type': 'WebSite',
      url: 'https://asharu.id'
    });
  });

  it('organization schema lists social profiles and a logo', () => {
    const org = organizationSchema();
    expect(org).toMatchObject({ '@type': 'Organization', name: 'Asharu' });
    expect(Array.isArray(org.sameAs)).toBe(true);
    expect(String(org.logo)).toMatch(/^https:\/\/asharu\.id\//);
  });

  it('product ItemList uses external product URLs only (no fake offers)', () => {
    const list = productListSchema(affiliateProducts.slice(0, 2), 'id');
    const items = list.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      '@type': 'ListItem',
      position: 1,
      name: 'Smartwatch Aktivitas Harian'
    });
    expect(JSON.stringify(list)).not.toContain('"@type":"Product"');
    expect(JSON.stringify(list)).not.toContain('offers');
  });

  it('property ItemList links to localized detail pages', () => {
    const list = propertyListSchema(properties, 'en');
    const items = list.itemListElement as Array<Record<string, unknown>>;
    expect(items[1]?.url).toBe(
      `https://asharu.id/en/properties/${properties[1]?.slug}`
    );
  });

  it('RealEstateListing matches visible content and omits unverified data', () => {
    const listing = realEstateListingSchema(properties[0]!, 'id') as Record<
      string,
      unknown
    >;
    expect(listing['@type']).toBe('RealEstateListing');
    expect(listing.url).toBe('https://asharu.id/id/properti/rumah-contoh-bandung');
    const serialized = JSON.stringify(listing);
    expect(serialized).not.toMatch(/price|offer|certificate|sertifikat/i);

    const props = listing.additionalProperty as Array<Record<string, unknown>>;
    expect(props.some((p) => p.name === 'bedrooms' && p.value === 3)).toBe(true);
  });

  it('breadcrumb chains positions from 1', () => {
    const crumb = breadcrumbSchema([
      { name: 'Asharu', url: 'https://asharu.id/id/' },
      { name: 'Properti', url: 'https://asharu.id/id/properti' }
    ]);
    const items = crumb.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((item) => item.position)).toEqual([1, 2]);
  });
});
