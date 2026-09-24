import { describe, expect, it } from 'vitest';
import { toAffiliateProduct } from './data-writer.mjs';

describe('toAffiliateProduct', () => {
  it('normalizes scraped titles and maps a known category', () => {
    const product = toAffiliateProduct(
      {
        linkId: '42',
        linkName: '  Kabel   USB-C  ',
        link: 'https://shopee.example/product/42',
        image: 'https://cdn.example/product.jpg',
        featured: true
      },
      { name: 'Asharu' }
    );

    expect(product).toMatchObject({
      id: 'affiliate-42',
      name: { id: 'Kabel USB-C', en: 'Kabel USB-C' },
      category: 'electronics',
      merchant: 'Asharu (Shopee)',
      url: 'https://shopee.example/product/42',
      image: 'https://cdn.example/product.jpg',
      featured: true
    });
  });

  it('falls back to Shopee and others for an empty title', () => {
    const product = toAffiliateProduct({ linkId: '43', link: 'https://example.test', image: '' }, null);

    expect(product.merchant).toBe('Shopee');
    expect(product.category).toBe('others');
    expect(product.name.id).toBe('');
  });
});
