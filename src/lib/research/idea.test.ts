import { describe, expect, it, vi } from 'vitest';
import {
  fetchRecentProductTopics,
  generateSessionIdea,
  parseIdeaOutput,
  parseIdeaText,
  researchProductMechanism,
  type IdeaDeps,
  type IdeaProduct
} from './idea';
import { buildIdeaPrompt } from './prompts';

const product: IdeaProduct = {
  id: 'p1',
  friendly_code: 'ASH-001',
  name_id: 'Kopi Maker Portable X',
  name_en: 'Portable Coffee Maker X',
  category: 'electronics',
  merchant: 'Tokopedia',
  url: 'https://example.com/produk/x'
};

const hints = {
  language: 'both',
  tone: 'casual',
  audience: 'umum',
  purpose: 'membagikan informasi bermanfaat',
  ctaStyle: 'soft_sell',
  templateSlug: null
};

function validRaw() {
  return {
    topic: 'Rahasia kopi kental dari alat sekecil botol minum',
    targetCategory: 'electronics',
    keywords: 'kopi maker portable, kopi kental',
    audience: 'pekerja mobile yang suka ngopi',
    audienceInterests: 'kopi, traveling',
    audienceAge: '20-35 tahun',
    targetLocation: 'Indonesia',
    accountGoal: 'edukasi praktis',
    purpose: 'membantu memilih alat kopi portable',
    tone: 'casual',
    ctaStyle: 'soft_sell'
  };
}

describe('parseIdeaOutput', () => {
  it('menerima output valid penuh', () => {
    const idea = parseIdeaOutput(validRaw());
    expect(idea?.topic).toMatch(/kopi kental/);
    expect(idea?.targetCategory).toBe('electronics');
    expect(idea?.audienceInterests).toEqual(['kopi', 'traveling']);
  });

  it('menolak topic <10 karakter', () => {
    expect(parseIdeaOutput({ ...validRaw(), topic: 'kopi' })).toBeNull();
  });

  it('menolak topic kosong / bukan objek', () => {
    expect(parseIdeaOutput({})).toBeNull();
    expect(parseIdeaOutput(null)).toBeNull();
    expect(parseIdeaOutput('string')).toBeNull();
  });

  it('menolak enum targetCategory/tone tak dikenal', () => {
    expect(parseIdeaOutput({ ...validRaw(), targetCategory: 'otomotif' })).toBeNull();
    expect(parseIdeaOutput({ ...validRaw(), tone: 'galak' })).toBeNull();
  });

  it('field opsional boleh hilang (null)', () => {
    const idea = parseIdeaOutput({ topic: 'Rahasia kopi kental dari alat sekecil botol minum' });
    expect(idea?.topic).toContain('kopi');
    expect(idea?.keywords).toBeNull();
    expect(idea?.audience).toBeNull();
  });

  it('audienceInterests array juga diterima', () => {
    const idea = parseIdeaOutput({ ...validRaw(), audienceInterests: ['kopi', 'outdoor'] });
    expect(idea?.audienceInterests).toEqual(['kopi', 'outdoor']);
  });
});

describe('parseIdeaText', () => {
  it('strip markdown fence', () => {
    const idea = parseIdeaText('```json\n' + JSON.stringify(validRaw()) + '\n```');
    expect(idea?.topic).toMatch(/kopi kental/);
  });

  it('ekstrak objek dari prosa sekitar', () => {
    const idea = parseIdeaText('Berikut idenya:\n' + JSON.stringify(validRaw()) + '\nSemoga membantu!');
    expect(idea?.topic).toMatch(/kopi kental/);
  });

  it('null untuk teks tanpa JSON', () => {
    expect(parseIdeaText('maaf saya tidak bisa')).toBeNull();
  });
});

describe('buildIdeaPrompt', () => {
  it('memuat nama produk, konteks mekanisme, dan negative topics', () => {
    const { system, user } = buildIdeaPrompt({
      productName: product.name_id,
      productCategory: product.category,
      productMerchant: product.merchant,
      productUrl: product.url,
      mechanismContext: 'alat kopi portable tekanan 20 bar',
      language: 'both',
      tone: 'casual',
      audience: 'umum',
      purpose: 'edukasi',
      ctaStyle: 'soft_sell',
      templateHint: null,
      recentTopics: ['Topik kopi kemarin'],
      varietySeed: 'abc123'
    });
    expect(system).toMatch(/Kopi Maker Portable X/);
    expect(system).toMatch(/tekanan 20 bar/);
    expect(system).toMatch(/JANGAN mengarang fitur/);
    expect(user).toMatch(/Topik kopi kemarin/);
    expect(user).toMatch(/abc123/);
  });

  it('fallback jujur bila konteks mekanisme kosong', () => {
    const { system } = buildIdeaPrompt({
      productName: product.name_id,
      productCategory: null,
      productMerchant: null,
      productUrl: null,
      mechanismContext: null,
      language: 'id',
      tone: 'casual',
      audience: 'umum',
      purpose: 'edukasi',
      ctaStyle: 'soft_sell',
      templateHint: null,
      recentTopics: [],
      varietySeed: 's1'
    });
    expect(system).toMatch(/konteks mekanisme tidak tersedia/);
  });
});

describe('researchProductMechanism', () => {
  it('menggabung search + extract, cap 2000 char', async () => {
    const provider = {
      name: 'mock',
      search: vi.fn(async () => [
        { title: 'Review X', url: 'https://a.com', content: 'tekanan 20 bar, baterai USB', score: 0.9 }
      ]),
      extract: vi.fn(async () => [{ title: 'Produk X', url: product.url!, content: 'halaman produk resmi dengan deskripsi panjang yang menjelaskan fitur alat kopi portable secara detail dan lengkap untuk pembeli', score: 1 }])
    };
    const ctx = await researchProductMechanism(provider, product);
    expect(ctx).not.toBeNull();
    expect(ctx!.length).toBeLessThanOrEqual(2000);
    expect(ctx).toMatch(/halaman produk resmi/);
    expect(ctx).toMatch(/tekanan 20 bar/);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('tetap jalan bila extract diblokir (best-effort)', async () => {
    const provider = {
      name: 'mock',
      search: vi.fn(async () => [
        { title: 'Review X', url: 'https://a.com', content: 'snippet review', score: 0.9 }
      ]),
      extract: vi.fn(async () => {
        throw new Error('bot detected');
      })
    };
    const ctx = await researchProductMechanism(provider, product);
    expect(ctx).toMatch(/snippet review/);
  });

  it('null bila search total gagal', async () => {
    const provider = {
      name: 'mock',
      search: vi.fn(async () => {
        throw new Error('network down');
      }),
      extract: vi.fn(async () => [])
    };
    expect(await researchProductMechanism(provider, product)).toBeNull();
  });
});

describe('fetchRecentProductTopics', () => {
  function makeClient(links: unknown[], sessions: unknown[]) {
    return {
      from(table: string) {
        if (table === 'content_research_session_products') {
          return {
            select: () => ({
              eq: () => ({ gte: async () => ({ data: links, error: null }) })
            })
          };
        }
        if (table === 'content_research_sessions') {
          return {
            select: () => ({
              in: () => ({ order: async () => ({ data: sessions, error: null }) })
            })
          };
        }
        throw new Error(`unexpected table ${table}`);
      }
    };
  }

  it('hanya topik mekanisme dua yang jadi negative examples', async () => {
    const supabase = makeClient(
      [
        { session_id: 's1', content_research_sessions: { created_at: 'x', mechanism: 'dua' } },
        { session_id: 's2', content_research_sessions: { created_at: 'x', mechanism: 'satu' } }
      ],
      [{ topic: 'Topik lama produk ini' }]
    );
    expect(await fetchRecentProductTopics(supabase as never, 'p1')).toEqual(['Topik lama produk ini']);
  });

  it('[] bila query gagal (tak blokir ideation)', async () => {
    const supabase = {
      from: () => {
        throw new Error('db down');
      }
    };
    expect(await fetchRecentProductTopics(supabase as never, 'p1')).toEqual([]);
  });
});

describe('generateSessionIdea', () => {
  function deps(over: Partial<IdeaDeps> = {}): IdeaDeps {
    const completion = async () => ({
      output: {
        text: JSON.stringify(validRaw()),
        provider: 'mock',
        model: 'm',
        keyId: 'k',
        latencyMs: 1
      },
      providerSlug: 'mock',
      model: 'm',
      keyHash: 'h',
      latencyMs: 1
    });
    return {
      searchProvider: {
        name: 'mock',
        search: async () => [],
        extract: async () => []
      },
      runCompletion: completion as unknown as IdeaDeps['runCompletion'],
      resolveIdeaModel: async () => ({ providerId: null, modelUuid: null }),
      ...over
    };
  }
  const supabase = { from: () => { throw new Error('no db'); } };

  it('happy path: konteks + ide valid', async () => {
    const idea = await generateSessionIdea(supabase as never, product, hints, null, deps());
    expect(idea?.topic).toMatch(/kopi kental/);
  });

  it('tanpa search provider tetap LLM-only', async () => {
    const runCompletion = vi.fn(async () => ({
      output: {
        text: JSON.stringify(validRaw()),
        provider: 'mock',
        model: 'm',
        keyId: 'k',
        latencyMs: 1
      },
      providerSlug: 'mock',
      model: 'm',
      keyHash: 'h',
      latencyMs: 1
    }));
    const idea = await generateSessionIdea(
      supabase as never,
      product,
      hints,
      null,
      deps({ searchProvider: null, runCompletion: runCompletion as unknown as IdeaDeps['runCompletion'] })
    );
    expect(idea?.topic).toMatch(/kopi kental/);
    expect(runCompletion).toHaveBeenCalledOnce();
  });

  it('null bila LLM gagal (fail-soft)', async () => {
    const idea = await generateSessionIdea(
      supabase as never,
      product,
      hints,
      null,
      deps({
        runCompletion: (async () => {
          throw new Error('llm down');
        }) as unknown as IdeaDeps['runCompletion']
      })
    );
    expect(idea).toBeNull();
  });

  it('null bila output LLM invalid', async () => {
    const idea = await generateSessionIdea(
      supabase as never,
      product,
      hints,
      null,
      deps({
        runCompletion: (async () => ({
          output: {
            text: '{"topic":"pendek"}',
            provider: 'mock',
            model: 'm',
            keyId: 'k',
            latencyMs: 1
          },
          providerSlug: 'mock',
          model: 'm',
          keyHash: 'h',
          latencyMs: 1
        })) as unknown as IdeaDeps['runCompletion']
      })
    );
    expect(idea).toBeNull();
  });
});
