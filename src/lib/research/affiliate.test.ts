import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Product {
  id: string;
  friendly_code: string;
  external_id: string;
  name_id: string;
  name_en: string;
  category: string;
  merchant: string;
  url: string;
  image: string;
}

function makeClient(products: Product[]): { client: SupabaseClient; selectSpy: ReturnType<typeof vi.fn> } {
  const selectSpy = vi.fn(() => ({
    eq: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn(async () => ({ data: products, error: null }))
      }))
    }))
  }));
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'affiliate_products') {
        return {
          select: selectSpy,
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: products, error: null }))
            }))
          }))
        };
      }
      return { select: vi.fn(() => ({}) as never) };
    })
  } as unknown as SupabaseClient;
  return { client, selectSpy };
}

import { selectAffiliateProduct, relevanceBand } from './affiliate';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selectAffiliateProduct', () => {
  it('returns null when pool is empty', async () => {
    const { client } = makeClient([]);
    const result = await selectAffiliateProduct(client, { topic: 'any topic' });
    expect(result).toBeNull();
  });

  it('picks product with matching category (score 50+)', async () => {
    const products: Product[] = [
      { id: 'p1', friendly_code: 'ASH-001', external_id: 'x1', name_id: 'Baju Anak', name_en: 'Kids Shirt', category: 'fashion', merchant: 'Toko A', url: 'https://a.com', image: '' },
      { id: 'p2', friendly_code: 'ASH-002', external_id: 'x2', name_id: 'Headset Gaming', name_en: 'Gaming Headset', category: 'electronics', merchant: 'Toko B', url: 'https://b.com', image: '' }
    ];
    const { client } = makeClient(products);
    const result = await selectAffiliateProduct(client, { topic: 'ulasan fashion anak', category: 'fashion' });
    expect(result).not.toBeNull();
    expect(result!.product.id).toBe('p1');
    expect(result!.matchScore).toBeGreaterThanOrEqual(50);
    expect(result!.signals.category_match).toBe(true);
  });

  it('picks by keyword overlap when no category match', async () => {
    const products: Product[] = [
      { id: 'p1', friendly_code: 'ASH-001', external_id: 'x1', name_id: 'Headset Gaming Premium', name_en: 'Premium Gaming Headset', category: 'electronics', merchant: 'Toko B', url: 'https://b.com', image: '' },
      { id: 'p2', friendly_code: 'ASH-002', external_id: 'x2', name_id: 'Baju Anak', name_en: 'Kids Shirt', category: 'fashion', merchant: 'Toko A', url: 'https://a.com', image: '' }
    ];
    const { client } = makeClient(products);
    const result = await selectAffiliateProduct(client, { topic: 'rekomendasi headset gaming terbaik' });
    expect(result).not.toBeNull();
    expect(result!.product.id).toBe('p1');
    expect(result!.matchScore).toBeGreaterThan(0);
    expect(result!.signals.keyword_overlap).toBeGreaterThan(0);
  });

  it('returns null when all scores are below threshold (better no affiliate than wrong affiliate)', async () => {
    const products: Product[] = [
      { id: 'p1', friendly_code: 'ASH-001', external_id: 'x1', name_id: 'Barang Satu', name_en: 'Item One', category: 'fashion', merchant: 'Toko A', url: 'https://a.com', image: '' },
      { id: 'p2', friendly_code: 'ASH-002', external_id: 'x2', name_id: 'Barang Dua', name_en: 'Item Two', category: 'electronics', merchant: 'Toko B', url: 'https://b.com', image: '' }
    ];
    const { client } = makeClient(products);
    const result = await selectAffiliateProduct(client, { topic: 'katak ungu neon' });
    expect(result).toBeNull();
  });

  it('returns null when best score is 3 (single keyword overlap, below threshold)', async () => {
    const products: Product[] = [
      { id: 'p1', friendly_code: 'ASH-001', external_id: 'x1', name_id: 'Piyama Anak', name_en: 'Kids Pajamas', category: 'fashion', merchant: 'Toko A', url: 'https://a.com', image: '' }
    ];
    const { client } = makeClient(products);
    const result = await selectAffiliateProduct(client, { topic: 'berita bbm naik untuk keluarga muda' });
    expect(result).toBeNull();
  });

  it('records scored_from_pool_size', async () => {
    const products: Product[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, friendly_code: `ASH-00${i + 1}`, external_id: `x${i}`,
      name_id: `Produk ${i}`, name_en: `Product ${i}`, category: 'misc', merchant: 'Toko', url: `https://${i}.com`, image: ''
    }));
    const { client } = makeClient(products);
    const result = await selectAffiliateProduct(client, { topic: 'produk toko rekomendasi' });
    expect(result).not.toBeNull();
    expect(result!.signals.scored_from_pool_size).toBe(5);
  });
});

describe('relevanceBand', () => {
  it('returns high for score >= 50', () => {
    expect(relevanceBand(50)).toBe('high');
    expect(relevanceBand(100)).toBe('high');
  });

  it('returns medium for 10 <= score < 50', () => {
    expect(relevanceBand(10)).toBe('medium');
    expect(relevanceBand(49)).toBe('medium');
  });

  it('returns low for score < 10', () => {
    expect(relevanceBand(0)).toBe('low');
    expect(relevanceBand(9)).toBe('low');
  });

  it('returns none for null/undefined', () => {
    expect(relevanceBand(null)).toBe('none');
  });
});
