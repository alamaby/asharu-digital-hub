import { describe, expect, it, vi, beforeEach } from 'vitest';

const UUID_P1 = '11111111-1111-4111-8111-111111111111';
const UUID_P2 = '22222222-2222-4222-8222-222222222222';
const UUID_M_NARAYA_1 = '33333333-3333-4333-8333-333333333333';
const UUID_M_CF_1 = '44444444-4444-4444-8444-444444444444';
const UUID_M_CF_2 = '55555555-5555-4555-8555-555555555555';

const { dbRef, llmImpl } = vi.hoisted(() => ({
  dbRef: { current: null as unknown },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  llmImpl: { current: null as any }
}));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => dbRef.current
}));

vi.mock('@/lib/llm/completion', () => ({
  runLLMCompletion: (...args: unknown[]) => (llmImpl.current as (...a: unknown[]) => Promise<unknown>)(...args)
}));

vi.mock('@/lib/llm/registry', () => ({
  ProviderRegistry: class {
    async listActive() {
      return [
        { id: UUID_P1, slug: 'naraya', display_name: 'Naraya', base_url: 'https://router.bynara.id/v1', is_active: true, priority: 10 },
        { id: UUID_P2, slug: 'cloudflare', display_name: 'Cloudflare', base_url: 'https://.cloudflare.com/v1', is_active: true, priority: 40 }
      ];
    }
  }
}));

vi.mock('@/lib/supabase/vault', () => ({
  fetchOrderedModels: vi.fn(async (providerId: string) => {
    if (providerId === UUID_P1) {
      return [
        { id: UUID_M_NARAYA_1, provider_id: UUID_P1, model_id: 'naraya/agnes-2.5-flash', display_name: 'Agnes Flash', is_default: true, priority: 10, is_active: true, last_used_at: null, config: null, usage_count: 0, failure_count: 0 }
      ];
    }
    if (providerId === UUID_P2) {
      return [
        { id: UUID_M_CF_1, provider_id: UUID_P2, model_id: '@cf/google/gemma-4-26b-a4b-it', display_name: 'Gemma 4 26B', is_default: false, priority: 20, is_active: true, last_used_at: null, config: null, usage_count: 0, failure_count: 0 },
        { id: UUID_M_CF_2, provider_id: UUID_P2, model_id: '@cf/qwen/qwen3-30b-a3b-fp8', display_name: 'Qwen3 30B', is_default: false, priority: 30, is_active: true, last_used_at: null, config: null, usage_count: 0, failure_count: 0 }
      ];
    }
    return [];
  }),
  markModelFailure: vi.fn(async () => {}),
  markModelUsage: vi.fn(async () => {})
}));

import { tryNextModelOnContentReject, MAX_CONTENT_FALLBACK } from './development';

const VALID_ARTICLE = JSON.stringify({
  id: {
    title: 'Judul Artikel',
    slug: 'judul-artikel',
    excerpt: 'Pengantar artikel yang cukup panjang untuk memenuhi minimum karakter 50.',
    sections: [
      { h2: 'Bagian 1', body: 'Isi bagian satu yang valid dan memadai sepanjang kalimatnya.' },
      { h2: 'Bagian 2', body: 'Isi bagian dua yang valid dan memadai sepanjang kalimatnya.' },
      { h2: 'Bagian 3', body: 'Isi bagian tiga yang valid dan memadai sepanjang kalimatnya.' }
    ],
    faq: [{ q: 'Pertanyaan?', a: 'Jawaban yang valid.' }],
    meta_title: 'Meta Judul',
    meta_desc: 'Deskripsi meta yang valid.'
  },
  en: null
});

// CJK article: valid JSON shape but rejected by parser due to CJK in section bodies
const CJK_ARTICLE = JSON.stringify({
  id: {
    title: 'Judul Artikel',
    slug: 'judul-artikel',
    excerpt: 'Pengantar artikel yang cukup panjang untuk memenuhi minimum karakter 50.',
    sections: [
      { h2: 'Bagian 散热', body: 'Isi bagian satu mengandung 散热 dan 团战 di dalamnya.' },
      { h2: 'Bagian 2', body: 'Isi bagian dua yang valid dan memadai sepanjang kalimatnya.' },
      { h2: 'Bagian 3', body: 'Isi bagian tiga yang valid dan memadai sepanjang kalimatnya.' }
    ],
    faq: [{ q: 'Pertanyaan?', a: 'Jawaban yang valid.' }],
    meta_title: 'Meta Judul',
    meta_desc: 'Deskripsi meta yang valid.'
  },
  en: null
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tryNextModelOnContentReject', () => {
  it('returns success when first available candidate (non-initial) parses', async () => {
    dbRef.current = {
      from: () => ({
        insert: vi.fn(async (rows: unknown[]) => ({ data: rows, error: null }))
      })
    };
    llmImpl.current = async () => ({
      output: { text: VALID_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
      providerSlug: 'cloudflare',
      model: '@cf/google/gemma-4-26b-a4b-it',
      keyHash: 'k2',
      latencyMs: 500,
      fallback: false
    });

    const result = await tryNextModelOnContentReject(
      dbRef.current as unknown as import('@supabase/supabase-js').SupabaseClient,
      'sess-1', 'topic-1',
      'sys', 'user', 0.7, 4000,
      UUID_P1, UUID_M_NARAYA_1, ['id']
    );

    expect(result.llmResult).not.toBeNull();
    expect(result.parsed?.id).not.toBeNull();
    expect(result.fallbackChain).toHaveLength(1);
    expect(result.fallbackChain[0]?.provider).toBe('cloudflare');
  });

  it('falls back across candidates when first rejects due to CJK', async () => {
    dbRef.current = {
      from: () => ({
        insert: vi.fn(async (rows: unknown[]) => ({ data: rows, error: null }))
      })
    };
    let callCount = 0;
    llmImpl.current = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          output: { text: CJK_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
          providerSlug: 'cloudflare',
          model: '@cf/google/gemma-4-26b-a4b-it',
          keyHash: 'k2',
          latencyMs: 600,
          fallback: false
        };
      }
      return {
        output: { text: VALID_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
        providerSlug: 'cloudflare',
        model: '@cf/qwen/qwen3-30b-a3b-fp8',
        keyHash: 'k3',
        latencyMs: 700,
        fallback: false
      };
    };

    const result = await tryNextModelOnContentReject(
      dbRef.current as unknown as import('@supabase/supabase-js').SupabaseClient,
      'sess-1', 'topic-1',
      'sys', 'user', 0.7, 4000,
      UUID_P1, UUID_M_NARAYA_1, ['id']
    );

    expect(result.llmResult).not.toBeNull();
    expect(result.parsed?.id).not.toBeNull();
    // Chain should contain both attempted models
    expect(result.fallbackChain).toHaveLength(2);
    expect(result.fallbackChain[0]?.provider).toBe('cloudflare');
    expect(result.fallbackChain[1]?.provider).toBe('cloudflare');
  });

  it('returns null when all candidates reject and max fallback reached', async () => {
    dbRef.current = {
      from: () => ({
        insert: vi.fn(async (rows: unknown[]) => ({ data: rows, error: null }))
      })
    };
    llmImpl.current = async () => ({
      output: { text: CJK_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
      providerSlug: 'cloudflare',
      model: '@cf/google/gemma-4-26b-a4b-it',
      keyHash: 'k2',
      latencyMs: 600,
      fallback: false
    });

    const result = await tryNextModelOnContentReject(
      dbRef.current as unknown as import('@supabase/supabase-js').SupabaseClient,
      'sess-1', 'topic-1',
      'sys', 'user', 0.7, 4000,
      UUID_P1, UUID_M_NARAYA_1, ['id']
    );

    expect(result.llmResult).toBeNull();
    expect(result.parsed).toBeNull();
    expect(result.fallbackChain.length).toBeGreaterThan(0);
  });

  it('skips the initial modelUuid', async () => {
    dbRef.current = {
      from: () => ({
        insert: vi.fn(async (rows: unknown[]) => ({ data: rows, error: null }))
      })
    };
    llmImpl.current = async () => ({
      output: { text: VALID_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
      providerSlug: 'cloudflare',
      model: '@cf/google/gemma-4-26b-a4b-it',
      keyHash: 'k2',
      latencyMs: 500,
      fallback: false
    });

    const result = await tryNextModelOnContentReject(
      dbRef.current as unknown as import('@supabase/supabase-js').SupabaseClient,
      'sess-1', 'topic-1',
      'sys', 'user', 0.7, 4000,
      UUID_P1, UUID_M_NARAYA_1, ['id']
    );

    // Chain should start with cloudflare (naraya's UUID_M_NARAYA_1 is skipped)
    expect(result.fallbackChain.some((c) => c.provider === 'naraya')).toBe(false);
    expect(result.llmResult).not.toBeNull();
  });

  it('respects MAX_CONTENT_FALLBACK cap = 2', async () => {
    expect(MAX_CONTENT_FALLBACK).toBe(2);
  });

  it('does not call markModelFailure for content rejects (key stays unblamed)', async () => {
    const { markModelFailure } = await import('@/lib/supabase/vault');
    vi.mocked(markModelFailure).mockClear();

    dbRef.current = {
      from: () => ({
        insert: vi.fn(async (rows: unknown[]) => ({ data: rows, error: null }))
      })
    };
    llmImpl.current = async () => ({
      output: { text: CJK_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
      providerSlug: 'cloudflare',
      model: '@cf/google/gemma-4-26b-a4b-it',
      keyHash: 'k2',
      latencyMs: 600,
      fallback: false
    });

    await tryNextModelOnContentReject(
      dbRef.current as unknown as import('@supabase/supabase-js').SupabaseClient,
      'sess-1', 'topic-1',
      'sys', 'user', 0.7, 4000,
      UUID_P1, UUID_M_NARAYA_1, ['id']
    );

    expect(markModelFailure).not.toHaveBeenCalled();
  });

  it('handles runLLMCompletion throwing (transport error) gracefully', async () => {
    dbRef.current = {
      from: () => ({
        insert: vi.fn(async (rows: unknown[]) => ({ data: rows, error: null }))
      })
    };
    llmImpl.current = async () => {
      throw new Error('network timeout');
    };

    const result = await tryNextModelOnContentReject(
      dbRef.current as unknown as import('@supabase/supabase-js').SupabaseClient,
      'sess-1', 'topic-1',
      'sys', 'user', 0.7, 4000,
      UUID_P1, UUID_M_NARAYA_1, ['id']
    );

    expect(result.llmResult).toBeNull();
    expect(result.parsed).toBeNull();
  });

  it('tracks full fallback chain on cross-provider recovery', async () => {
    dbRef.current = {
      from: () => ({
        insert: vi.fn(async (rows: unknown[]) => ({ data: rows, error: null }))
      })
    };
    let callCount = 0;
    llmImpl.current = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          output: { text: CJK_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
          providerSlug: 'cloudflare',
          model: '@cf/google/gemma-4-26b-a4b-it',
          keyHash: 'k2',
          latencyMs: 600,
          fallback: false
        };
      }
      return {
        output: { text: VALID_ARTICLE, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' },
        providerSlug: 'cloudflare',
        model: '@cf/qwen/qwen3-30b-a3b-fp8',
        keyHash: 'k3',
        latencyMs: 700,
        fallback: false
      };
    };

    const result = await tryNextModelOnContentReject(
      dbRef.current as unknown as import('@supabase/supabase-js').SupabaseClient,
      'sess-1', 'topic-1',
      'sys', 'user', 0.7, 4000,
      UUID_P1, UUID_M_NARAYA_1, ['id']
    );

    expect(result.llmResult).not.toBeNull();
    expect(result.parsed?.id).not.toBeNull();
    // Chain should show the progression from rejected to successful
    expect(result.fallbackChain).toHaveLength(2);
  });
});
