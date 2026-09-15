import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  affiliateProductSchema,
  type AffiliateProduct,
  propertySchema,
  shopLinkSchema,
  socialLinkSchema
} from './schemas';
import { properties } from './properties';
import { shopLinks, getVisibleShopLinks } from './shop-links';
import { getPublishedProperties } from './properties';
import { getSocialLinks } from './social-links';

// M4 DB-only: fixture hermetik (tidak ada lagi file statis affiliate).
// Cakup validasi skema + unique id + featured≤6.
const fixtureProducts: AffiliateProduct[] = [
  {
    id: 'ASH-001',
    name: { id: 'Produk satu', en: 'Product one' },
    category: 'electronics',
    description: { id: 'Produk satu', en: 'Product one' },
    merchant: 'Racun outfit asharu (Shopee)',
    url: 'https://s.shopee.co.id/a',
    image: 'https://hljjmmejmirqikmbaryl.supabase.co/storage/v1/object/public/affiliate-images/41084744-a.webp',
    featured: true
  },
  {
    id: 'ASH-002',
    name: { id: 'Produk dua', en: 'Product two' },
    category: 'fashion',
    description: { id: 'Produk dua en', en: 'Product two en' },
    merchant: 'Racun outfit asharu (Shopee)',
    url: 'https://s.shopee.co.id/b',
    image: 'https://hljjmmejmirqikmbaryl.supabase.co/storage/v1/object/public/affiliate-images/40631272-b.webp',
    featured: true
  },
  {
    id: 'ASH-003',
    name: { id: 'Produk tiga', en: 'Product three' },
    category: 'others',
    description: { id: 'Produk tiga', en: 'Product three' },
    merchant: 'Racun outfit asharu (Shopee)',
    url: 'https://s.shopee.co.id/c',
    image: 'https://hljjmmejmirqikmbaryl.supabase.co/storage/v1/object/public/affiliate-images/40455095-c.webp',
    featured: false
  }
];

describe('static dataset integrity', () => {
  it('all shop links validate against the schema', () => {
    for (const link of shopLinks) {
      expect(shopLinkSchema.safeParse(link).success).toBe(true);
    }
  });

  it('shopee store uses the clean canonical URL with a tracked affiliate fallback', () => {
    const shopee = shopLinks.find((link) => link.id === 'shopee');
    expect(shopee?.url).toBe('https://shopee.co.id/shop/9268731');
    expect(shopee?.affiliateUrl).toMatch(/^https:\/\/id\.shp\.ee\//);
  });

  it('shopee store identity matches the verified owner-provided name', () => {
    const shopee = shopLinks.find((link) => link.id === 'shopee');
    expect(shopee?.name.id).toBe('Asharu x Nopi.NY');
    expect(shopee?.name.en).toBe('Asharu x Nopi.NY');
  });

  it('shop destination URLs are unique', () => {
    const urls = shopLinks.map((link) => link.affiliateUrl ?? link.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('only the verified Shopee store is published right now', () => {
    const visible = getVisibleShopLinks();
    expect(visible.map((link) => link.id)).toEqual(['shopee']);
    // Hidden scaffold entries stay schema-valid for future publishing.
    expect(shopLinks.length).toBeGreaterThan(visible.length);
    for (const link of shopLinks) {
      expect(shopLinkSchema.safeParse(link).success).toBe(true);
    }
  });

  it('published properties are exactly the three migrated listings', () => {
    expect(getPublishedProperties().map((property) => property.slug)).toEqual([
      'dijual-rumah-kamarasan-bandung-timur',
      'dijual-apartemen-studio-buah-batu-park-bandung',
      'disewakan-rumah-toko-sukaraja-jatiwangi-majalengka'
    ]);
  });

  it('base social links validate against the schema', () => {
    for (const link of getSocialLinks()) {
      expect(socialLinkSchema.safeParse(link).success).toBe(true);
    }
  });

  it('WhatsApp is never hard-coded into the base social list', () => {
    expect(getSocialLinks().some((l) => l.platform === 'whatsapp')).toBe(false);
    const withWhatsapp = getSocialLinks('https://wa.me/628000000000');
    expect(withWhatsapp.at(-1)?.platform).toBe('whatsapp');
  });

  it('all products validate and use unique ids', () => {
    const ids = fixtureProducts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const product of fixtureProducts) {
      expect(affiliateProductSchema.safeParse(product).success, product.id).toBe(true);
    }
  });

  it('at most six featured products (homepage limit)', () => {
    expect(fixtureProducts.filter((p) => p.featured).length).toBeLessThanOrEqual(6);
  });

  it('all properties validate with unique slugs', () => {
    const slugs = properties.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const property of properties) {
      const result = propertySchema.safeParse(property);
      expect(result.success, property.slug).toBe(true);
    }
  });

  it('at most six featured properties (homepage limit)', () => {
    expect(properties.filter((p) => p.featured).length).toBeLessThanOrEqual(6);
  });

  it('placeholder images referenced by property datasets exist on disk', () => {
    const images = properties.map((p) => p.image);
    for (const image of images) {
      const filePath = join(process.cwd(), 'public', image.replace(/^\//, ''));
      expect(existsSync(filePath), image).toBe(true);
    }
  });

  it('prices only exist on owner-verified published listings', () => {
    for (const property of properties) {
      if (property.hidden) {
        expect(property.price, property.slug).toBeUndefined();
      }
    }
    const priced = properties.filter((p) => !p.hidden && p.price);
    expect(priced.length).toBeGreaterThan(0);
    for (const property of priced) {
      expect(property.price?.amount, property.slug).toBeGreaterThan(0);
    }
  });

  it('no fake ratings or certificates leak into data', () => {
    const blob = JSON.stringify({ shopLinks, properties });
    expect(blob).not.toMatch(/\brating\b/i);
    expect(blob).not.toMatch(/"sertifikat"/i);
  });
});
