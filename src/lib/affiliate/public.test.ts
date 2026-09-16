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
  it('orders featured first, then newest — not by friendly_code', async () => {
    state.rows = [row('ASH-255', { is_featured: true }), row('ASH-001')];

    const products = await getActiveProducts();

    expect(state.fromCalls).toEqual(['affiliate_products']);
    expect(state.eqCalls).toEqual([['is_active', true]]);
    expect(state.orderCalls).toEqual([
      ['is_featured', { ascending: false }],
      ['created_at', { ascending: false }]
    ]);
    expect(products.map((p) => p.id)).toEqual(['ASH-255', 'ASH-001']);
  });

  it('maps rows to AffiliateProduct and falls back to "others" for unknown categories', async () => {
    state.rows = [row('ASH-255', { category: 'tidak-dikenal', is_featured: true })];

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
});

describe('getFeaturedProductsDB', () => {
  it('filters both is_active and is_featured, then orders newest first with a limit', async () => {
    state.rows = [row('ASH-255', { is_featured: true })];

    const products = await getFeaturedProductsDB();

    expect(state.eqCalls).toEqual([
      ['is_active', true],
      ['is_featured', true]
    ]);
    expect(state.orderCalls).toEqual([['created_at', { ascending: false }]]);
    expect(state.limitCalls).toEqual([6]);
    expect(products).toHaveLength(1);
  });

  it('honours a custom max', async () => {
    await getFeaturedProductsDB(3);
    expect(state.limitCalls).toEqual([3]);
  });
});
