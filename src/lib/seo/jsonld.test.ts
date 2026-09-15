import { describe, expect, it } from 'vitest';
import {
  breadcrumbSchema,
  organizationSchema,
  productListSchema,
  propertyListSchema,
  realEstateListingSchema,
  websiteSchema
} from './jsonld';
import { affiliateProductSchema, type AffiliateProduct } from '@/data/schemas';
import { properties } from '@/data/properties';

const fixtureProducts: AffiliateProduct[] = [
  {
    id: 'ASH-001',
    name: { id: 'Mainan Tamagotchi', en: 'Tamagotchi Toy' },
    category: 'sports-hobby',
    description: { id: 'Mainan Tamagotchi', en: 'Tamagotchi Toy' },
    merchant: 'Racun outfit asharu (Shopee)',
    url: 'https://s.shopee.co.id/1',
    image: 'https://hljjmmejmirqikmbaryl.supabase.co/storage/v1/object/public/affiliate-images/41084744-a.webp',
    featured: true
  },
  {
    id: 'ASH-002',
    name: { id: 'Wireless Mouse', en: 'Wireless Mouse' },
    category: 'electronics',
    description: { id: 'Wireless Mouse', en: 'Wireless Mouse' },
    merchant: 'Racun outfit asharu (Shopee)',
    url: 'https://s.shopee.co.id/2',
    image: 'https://hljjmmejmirqikmbaryl.supabase.co/storage/v1/object/public/affiliate-images/40631272-b.webp',
    featured: false
  }
];

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
    const list = productListSchema(fixtureProducts.slice(0, 2), 'id');
    const items = list.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      '@type': 'ListItem',
      position: 1,
      name: fixtureProducts[0]!.name.id
    });
    expect(JSON.stringify(list)).not.toContain('"@type":"Product"');
    expect(JSON.stringify(list)).not.toContain('offers');
    expect(fixtureProducts.every((p) => affiliateProductSchema.safeParse(p).success)).toBe(true);
  });

  it('property ItemList links to localized detail pages', () => {
    const list = propertyListSchema(properties, 'en');
    const items = list.itemListElement as Array<Record<string, unknown>>;
    expect(items[1]?.url).toBe(
      `https://asharu.id/en/properties/${properties[1]?.slug}`
    );
  });

  it('RealEstateListing matches visible content and emits owner-verified offers', () => {
    const listing = realEstateListingSchema(properties[0]!, 'id') as Record<
      string,
      unknown
    >;
    expect(listing['@type']).toBe('RealEstateListing');
    expect(listing.url).toBe(
      `https://asharu.id/id/properti/${properties[0]!.slug}`
    );

    const offers = listing.offers as Record<string, unknown>;
    expect(offers).toMatchObject({
      '@type': 'Offer',
      price: 650000000,
      priceCurrency: 'IDR',
      availability: 'https://schema.org/InStock'
    });

    const serialized = JSON.stringify(listing);
    expect(serialized).not.toMatch(/rating/i);

    const props = listing.additionalProperty as Array<Record<string, unknown>>;
    expect(props.some((p) => p.name === 'bedrooms' && p.value === 3)).toBe(true);
  });

  it('occupied listings emit SoldOut availability', () => {
    const occupied = properties.find((p) => p.availability === 'occupied');
    if (!occupied) throw new Error('expected an occupied fixture');
    const listing = realEstateListingSchema(occupied, 'id');
    expect((listing.offers as Record<string, unknown>).availability).toBe(
      'https://schema.org/SoldOut'
    );
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
