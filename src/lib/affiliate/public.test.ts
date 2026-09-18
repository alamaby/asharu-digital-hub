import { describe, expect, it, vi, beforeEach } from 'vitest';

interface Builder {
  select: () => Builder;
  eq: (column: string, value: unknown) => Builder;
  order: (column: string, options: { ascending: boolean }) => Builder;
  limit: (count: number) => Builder;
  then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => unknown;
}

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  fromCalls: [] as string[],
  eqCalls: [] as Array<[string, unknown]>,
  orderCalls: [] as Array<[string, { ascending: boolean }]>,
  limitCalls: [] as number[],
  hasSupabase: true
}));

vi.mock('@/lib/env', () => ({
  env: {
    get hasSupabase() {
      return state.hasSupabase;
    },
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'sb_publishable_test'
  }
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      state.fromCalls.push(table);
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.eqCalls.push([column, value]);
          return builder;
        },
        order: (column: string, options: { ascending: boolean }) => {
          state.orderCalls.push([column, options]);
          return builder;
        },
        limit: (count: number) => {
          state.limitCalls.push(count);
          return builder;
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: state.rows, error: null })
      };
      return builder as unknown as Builder;
    }
  })
}));

import { getActiveProducts, getFeaturedProductsDB } from './public';

function row(friendlyCode: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    friendly_code: friendlyCode,
    external_id: `ext-${friendlyCode}`,
    name_id: `Nama ${friendlyCode}`,
    name_en: `Name ${friendlyCode}`,
    category: 'electronics',
    merchant: 'Toko Uji',
    url: 'https://example.com/p',
    image: 'https://example.supabase.co/storage/v1/object/public/affiliate-images/a.webp',
    is_featured: false,
    featured_override: null as boolean | null,
    featured_rank: 2,
    created_at: '2026-09-01T00:00:00Z',
    ...overrides
  };
}

beforeEach(() => {
  state.rows = [];
  state.fromCalls = [];
  state.eqCalls = [];
  state.orderCalls = [];
  state.limitCalls = [];
  state.hasSupabase = true;
});

describe('getActiveProducts', () => {
  it('orders by featured_rank first, then newest — not by friendly_code', async () => {
    state.rows = [row('ASH-255', { is_featured: true, featured_rank: 1 }), row('ASH-001')];

    const products = await getActiveProducts();

    expect(state.fromCalls).toEqual(['affiliate_products']);
    expect(state.eqCalls).toEqual([['is_active', true]]);
    expect(state.orderCalls).toEqual([
      ['featured_rank', { ascending: true }],
      ['created_at', { ascending: false }]
    ]);
    expect(products.map((p) => p.id)).toEqual(['ASH-255', 'ASH-001']);
  });

  it('maps rows to AffiliateProduct and falls back to "others" for unknown categories', async () => {
    state.rows = [row('ASH-255', { category: 'tidak-dikenal', is_featured: true, featured_rank: 1 })];

    const [product] = await getActiveProducts();

    expect(product).toMatchObject({
      id: 'ASH-255',
      name: { id: 'Nama ASH-255', en: 'Name ASH-255' },
      category: 'others',
      merchant: 'Toko Uji',
      featured: true
    });
  });

  it('returns an empty array without touching Supabase when env is missing', async () => {
    state.hasSupabase = false;

    await expect(getActiveProducts()).resolves.toEqual([]);
    expect(state.fromCalls).toEqual([]);
  });

  it('flags pinned override as featured=true regardless of is_featured', async () => {
    state.rows = [row('ASH-NEW', { is_featured: false, featured_override: true, featured_rank: 0 })];

    const [product] = await getActiveProducts();
    expect(product).toBeDefined();
    expect(product!.featured).toBe(true);
  });

  it('flags excluded override as featured=false even if scraper set is_featured', async () => {
    state.rows = [row('ASH-OLD', { is_featured: true, featured_override: false, featured_rank: 2 })];

    const [product] = await getActiveProducts();
    expect(product).toBeDefined();
    expect(product!.featured).toBe(false);
  });
});

describe('getFeaturedProductsDB', () => {
  it('filters out featured_override=false and orders ranked, then newest with a limit', async () => {
    // Simulasikan: 1 pinned (rank 0), 1 auto-scraper (rank 1), 1 excluded (rank 2)
    state.rows = [
      row('ASH-PINNED', { is_featured: false, featured_override: true, featured_rank: 0 }),
      row('ASH-AUTO', { is_featured: true, featured_override: null, featured_rank: 1 }),
      row('ASH-EXCL', { is_featured: true, featured_override: false, featured_rank: 2 })
    ];

    const products = await getFeaturedProductsDB();

    expect(state.eqCalls).toEqual([['is_active', true]]);
    expect(state.orderCalls).toEqual([
      ['featured_rank', { ascending: true }],
      ['created_at', { ascending: false }]
    ]);
    // limit dibesarin buffer = max + 6 = 12 untuk filter JS
    expect(state.limitCalls).toEqual([12]);
    expect(products.map((p) => p.id)).toEqual(['ASH-PINNED', 'ASH-AUTO']);
    expect(products).toHaveLength(2);
  });

  it('honours a custom max', async () => {
    state.rows = [row('ASH-X', { is_featured: true, featured_rank: 1 })];
    await getFeaturedProductsDB(3);
    expect(state.limitCalls).toEqual([9]); // max=3 + buffer=6
  });

  it('returns empty when all rows are excluded', async () => {
    state.rows = [row('ASH-X', { is_featured: true, featured_override: false, featured_rank: 2 })];
    const result = await getFeaturedProductsDB();
    expect(result).toHaveLength(0);
  });
});
