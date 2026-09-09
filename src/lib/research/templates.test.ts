import { describe, expect, it } from 'vitest';
import { RESEARCH_TEMPLATE_SLUGS } from './templates';
import { buildDiscoveryPrompt } from './prompts';
import { buildThreadPrompt } from '@/lib/llm/prompt';

describe('research templates', () => {
  it('mendaftarkan 6 slug template', () => {
    expect([...RESEARCH_TEMPLATE_SLUGS]).toEqual([
      'problem-solution',
      'before-after',
      'product-comparison',
      'top-product-list',
      'product-education',
      'promotion-urgency'
    ]);
  });

  it('discovery menyuntik hint template bila diisi', () => {
    const base = {
      targetLocation: 'Indonesia',
      audienceAge: 'umum',
      audienceInterests: [] as string[],
      platform: 'all',
      tone: 'casual',
      accountGoal: 'jualan',
      allowedCategories: [] as string[],
      excludedCategories: [] as string[],
      currentDatetime: new Date().toISOString(),
      freshnessHours: 24,
      minimumCandidates: 12
    };
    const withTpl = buildDiscoveryPrompt({ ...base, templateDiscoveryHint: 'alur Masalah → Solusi' }, []);
    expect(withTpl.system).toContain('TEMPLATE RISET');
    expect(withTpl.system).toContain('alur Masalah → Solusi');
    const bebas = buildDiscoveryPrompt({ ...base, templateDiscoveryHint: null }, []);
    expect(bebas.system).not.toContain('TEMPLATE RISET');
  });

  it('thread menyuntik struktur template bila diisi', () => {
    const input = {
      topic: 'kopi',
      platform: { slug: 'threads', maxChars: 500 },
      tone: 'casual',
      audience: 'umum',
      ctaStyle: 'soft_sell',
      purpose: 'jualan',
      language: 'both' as const
    };
    const product = { friendlyCode: 'ASH-1', name: 'Kopi', url: 'https://x.test', category: 'food' };
    const withTpl = buildThreadPrompt({ ...input, templateStructure: 'alur A → B → CTA' }, product);
    expect(withTpl.system).toContain('TEMPLATE STRUKTUR');
    expect(withTpl.system).toContain('alur A → B → CTA');
    const bebas = buildThreadPrompt(input, product);
    expect(bebas.system).not.toContain('TEMPLATE STRUKTUR');
  });
});
