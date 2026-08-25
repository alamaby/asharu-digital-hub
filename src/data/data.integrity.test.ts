import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  affiliateProductSchema,
  propertySchema,
  shopLinkSchema,
  socialLinkSchema
} from './schemas';
import { affiliateProducts } from './affiliate-products';
import { properties } from './properties';
import { shopLinks } from './shop-links';
import { getSocialLinks } from './social-links';

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
    const ids = affiliateProducts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const product of affiliateProducts) {
      const result = affiliateProductSchema.safeParse(product);
      expect(result.success, product.id).toBe(true);
    }
  });

  it('at most six featured products (homepage limit)', () => {
    expect(affiliateProducts.filter((p) => p.featured).length).toBeLessThanOrEqual(6);
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

  it('placeholder images referenced by datasets exist on disk', () => {
    const images = [
      ...affiliateProducts.map((p) => p.image),
      ...properties.map((p) => p.image)
    ];
    for (const image of images) {
      const filePath = join(process.cwd(), 'public', image.replace(/^\//, ''));
      expect(existsSync(filePath), image).toBe(true);
    }
  });

  it('no fake prices, ratings or certificates leak into data', () => {
    const blob = JSON.stringify({ shopLinks, affiliateProducts, properties });
    expect(blob).not.toMatch(/"price"/i);
    expect(blob).not.toMatch(/rating/i);
    expect(blob).not.toMatch(/sertifikat|certificate/i);
  });
});
