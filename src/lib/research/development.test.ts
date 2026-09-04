import { describe, expect, it } from 'vitest';
import { normalizePlaceholder, parseThread, repositionPlaceholder, sanitizeThreadText } from './thread';
import { AFFILIATE_OPENERS_ID, AFFILIATE_OPENERS_EN, buildSingleReplyRewritePrompt, buildThreadPrompt } from '@/lib/llm/prompt';

const P = '{{PRODUCT_URL}}';

function thread(opts: {
  mainId?: string;
  mainEn?: string;
  replies?: Array<{ id?: string; en?: string }>;
}) {
  return {
    main: { id: opts.mainId ?? 'main id', en: opts.mainEn ?? 'main en' },
    replies: (opts.replies ?? []).map((r) => ({ id: r.id ?? 'reply id', en: r.en ?? 'reply en' }))
  };
}

describe('normalizePlaceholder', () => {
  it('keeps a single placeholder untouched', () => {
    const t = thread({ mainId: `cek ${P}`, mainEn: 'check' });
    const out = normalizePlaceholder(t);
    expect(out.main.id).toBe(`cek ${P}`);
    expect(out.main.en).toBe('check');
  });

  it('injects a placeholder into main.id when there are none', () => {
    const t = thread({ mainId: 'no placeholder', mainEn: 'none en' });
    const out = normalizePlaceholder(t);
    expect(out.main.id).toBe(`no placeholder ${P}`);
    expect(out.main.en).toBe('none en');
  });

  it('keeps only the first of two placeholders split across main.id + main.en (regression for session 86b2d3b7)', () => {
    const t = thread({ mainId: `cek ${P}`, mainEn: `tap ${P}` });
    const out = normalizePlaceholder(t);
    expect(out.main.id).toBe(`cek ${P}`);
    expect(out.main.en).toBe('tap ');
    expect([out.main.id, out.main.en].join(' ').match(/\{\{PRODUCT_URL\}\}/g)).toHaveLength(1);
  });

  it('keeps only the first of two placeholders inside a single string', () => {
    const t = thread({ mainId: `a ${P} b ${P}`, mainEn: 'en' });
    const out = normalizePlaceholder(t);
    expect(out.main.id).toBe(`a ${P} b `);
    expect(out.main.en).toBe('en');
  });

  it('keeps only the first across main + multiple replies', () => {
    const t = thread({
      mainId: `main ${P}`,
      mainEn: 'main en',
      replies: [{ id: `r1 ${P}`, en: 'r1 en' }, { id: 'r2 id', en: `r2 ${P}` }]
    });
    const out = normalizePlaceholder(t);
    expect(out.main.id).toBe(`main ${P}`);
    expect(out.replies[0]!.id).toBe('r1 ');
    expect(out.replies[1]!.en).toBe('r2 ');
    const all = [out.main.id, out.main.en, ...out.replies.flatMap((r) => [r.id, r.en])].join(' ');
    expect(all.match(/\{\{PRODUCT_URL\}\}/g)).toHaveLength(1);
  });

  it('prefers main.id first, then main.en, then replies in order', () => {
    const t = thread({
      mainId: 'no ph here',
      mainEn: `en ${P}`,
      replies: [{ id: `r1 ${P}`, en: 'r1 en' }]
    });
    const out = normalizePlaceholder(t);
    expect(out.main.en).toBe(`en ${P}`);
    expect(out.replies[0]!.id).toBe('r1 ');
  });
});

describe('parseThread', () => {
  it('parses valid JSON with exactly one placeholder', () => {
    const raw = JSON.stringify({
      main: { id: `halo ${P}`, en: `hi ${P}` },
      replies: [{ id: 'reply', en: 'reply en' }]
    });
    const out = parseThread(raw);
    expect(out).not.toBeNull();
    expect(out!.main.id).toBe(`halo ${P}`);
    expect(out!.main.en).toBe('hi');
  });

  it('parses JSON wrapped in ```json fences', () => {
    const raw = '```json\n' + JSON.stringify({
      main: { id: `x ${P}`, en: 'x en' },
      replies: []
    }) + '\n```';
    expect(parseThread(raw)).not.toBeNull();
  });

  it('parses JSON embedded in surrounding prose', () => {
    const raw = 'Here is the thread:\n' + JSON.stringify({
      main: { id: `y ${P}`, en: 'y en' },
      replies: []
    }) + '\nThanks!';
    expect(parseThread(raw)).not.toBeNull();
  });

  it('injects a placeholder when none present and parses successfully', () => {
    const raw = JSON.stringify({
      main: { id: 'no ph', en: 'no ph en' },
      replies: []
    });
    const out = parseThread(raw);
    expect(out).not.toBeNull();
    expect(out!.main.id).toBe('no ph {{PRODUCT_URL}}');
  });

  it('returns null for malformed JSON', () => {
    expect(parseThread('not json at all')).toBeNull();
    expect(parseThread('{ broken')).toBeNull();
  });

  it('returns null when schema is wrong (missing fields)', () => {
    const raw = JSON.stringify({ main: { id: `a ${P}` }, replies: [] });
    expect(parseThread(raw)).toBeNull();
  });

  it('returns null when replies exceed max 10', () => {
    const replies = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, en: `r${i} en` }));
    replies[0]!.id = `r0 ${P}`;
    const raw = JSON.stringify({
      main: { id: 'm', en: 'm en' },
      replies
    });
    expect(parseThread(raw)).toBeNull();
  });

  it('accepts up to 10 replies (schema bumped for target reply count)', () => {
    const replies = Array.from({ length: 10 }, (_, i) => ({ id: `r${i} ${i === 0 ? P : ''}`, en: `r${i} en` }));
    const raw = JSON.stringify({
      main: { id: 'm', en: 'm en' },
      replies
    });
    expect(parseThread(raw)).not.toBeNull();
  });

  it('regression: 2 placeholders split across main.id + main.en now parses (previously failed)', () => {
    const raw = JSON.stringify({
      main: { id: `cek di sini ya ${P}`, en: `tap here ${P}` },
      replies: [{ id: 'reply id', en: 'reply en' }]
    });
    const out = parseThread(raw);
    expect(out).not.toBeNull();
    expect(out!.main.id).toBe(`cek di sini ya ${P}`);
    expect(out!.main.en).toBe('tap here');
  });
});

describe('repositionPlaceholder', () => {
  function mk(n: number, phAt: number) {
    const replies = Array.from({ length: n }, (_, i) => ({ id: `reply ${i} text yang lumayan panjang`, en: `reply ${i} en` }));
    if (phAt === -1) return { main: { id: `main with ${P}`, en: 'main en' }, replies };
    replies[phAt]!.id = `reply ${phAt} text dengan link ${P} di tengah`;
    return { main: { id: 'main id', en: 'main en' }, replies };
  }

  it('moves placeholder from main to middle reply (6 replies -> idx 3)', () => {
    const t = mk(6, -1);
    const { thread: out, postIndex } = repositionPlaceholder(t, 'middle');
    expect(out.main.id).toBe('main with');
    expect(out.replies[3]!.id).toContain(P);
    expect(postIndex).toBe(4);
  });

  it('moves placeholder from reply 0 to middle reply (4 replies -> idx 2)', () => {
    const t = mk(4, 0);
    const { thread: out, postIndex } = repositionPlaceholder(t, 'middle');
    const old = t.replies[0]!.id.replace(P, '').trim();
    const stripped = out.replies[0]!.id.replace(/\s+/g, ' ').trim();
    expect(stripped.length).toBeLessThanOrEqual(old.length + 5);
    expect(out.replies[2]!.id).toContain(P);
    expect(postIndex).toBe(3);
  });

  it('uses second_to_last strategy (6 replies -> idx 4)', () => {
    const t = mk(6, -1);
    const { thread: out, postIndex } = repositionPlaceholder(t, 'second_to_last');
    expect(out.replies[4]!.id).toContain(P);
    expect(postIndex).toBe(5);
  });

  it('returns postIndex 0 and keeps placeholder in main when no replies', () => {
    const t = { main: { id: `main ${P}`, en: 'main en' }, replies: [] as { id: string; en: string }[] };
    const { thread: out, postIndex } = repositionPlaceholder(t, 'middle');
    expect(out.main.id).toContain(P);
    expect(postIndex).toBe(0);
  });

  it('no-op when placeholder already in target reply', () => {
    const t = mk(4, 2);
    const { thread: out, postIndex } = repositionPlaceholder(t, 'middle');
    expect(out.replies[2]!.id).toContain(P);
    expect(postIndex).toBe(3);
  });

  it('wraps bare-link reply with basa-basi template', () => {
    const t = {
      main: { id: 'main id', en: 'main en' },
      replies: [
        { id: `short ${P}`, en: 'r0 en' },
        { id: 'reply one with enough context text here', en: 'r1 en' },
        { id: 'reply two with enough context text here', en: 'r2 en' },
        { id: 'reply three text', en: 'r3 en' }
      ]
    };
    const { thread: out, postIndex } = repositionPlaceholder(t, 'middle');
    expect(out.replies[2]!.id).toContain(P);
    expect(out.replies[2]!.id.length).toBeGreaterThan(40);
    expect(out.replies[2]!.id).not.toBe(P);
    expect(out.replies[0]!.id).not.toContain(P);
    expect(postIndex).toBe(3);
  });

  it('exact placeholder count stays 1 after reposition', () => {
    const t = mk(6, -1);
    const { thread: out } = repositionPlaceholder(t, 'middle');
    const match = [out.main.id, out.main.en, ...out.replies.flatMap((r) => [r.id, r.en])].join(' ').match(/\{\{PRODUCT_URL\}\}/g);
    expect(match).toHaveLength(1);
  });

  it('regression 2aa5be7d: parses thread with replies as plain strings (LLM shape drift)', () => {
    const raw = JSON.stringify({
      main: { id: 'main id', en: 'main en' },
      replies: ['reply satu', 'reply dua dengan link {{PRODUCT_URL}} di tengah']
    });
    const out = parseThread(raw);
    expect(out).not.toBeNull();
    expect(out!.replies[0]).toEqual({ id: 'reply satu', en: 'reply satu' });
    expect(out!.replies[1]!.id).toContain(P);
  });

  it('string-coerced thread without placeholder gets one injected in main (normalize backstop)', () => {
    const raw = JSON.stringify({
      main: { id: 'main id', en: 'main en' },
      replies: ['reply satu tanpa link', 'reply dua tanpa link']
    });
    const out = parseThread(raw);
    expect(out).not.toBeNull();
    expect(out!.main.id).toContain(P);
  });

  it('repositionPlaceholder on 7 replies targets middle idx 3 (6 konten + 1 affiliate)', () => {
    const t = mk(7, -1);
    const { thread: out, postIndex } = repositionPlaceholder(t, 'middle');
    expect(out.replies[3]!.id).toContain(P);
    expect(postIndex).toBe(4);
  });

  it('repositioned affiliate reply starts with opener', () => {
    const t = mk(4, -1);
    const { thread: out } = repositionPlaceholder(t, 'middle');
    const target = out.replies[2]!.id;
    expect(target.startsWith('Btw,') || target.startsWith('Intermezzo')).toBe(true);
  });
});

describe('sanitizeThreadText', () => {
  it('strips CJK ideographs (regression for session b01339ae "巡航")', () => {
    expect(sanitizeThreadText('Lanjut, biasain巡航 di kecepatan konstan')).toBe('Lanjut, biasain di kecepatan konstan');
  });

  it('strips Hiragana, Katakana, and Hangul', () => {
    expect(sanitizeThreadText('helloこんにちは worldカタカナ 안녕하세요')).toBe('hello world');
  });

  it('preserves Latin, digits, punctuation, and emoji', () => {
    const s = 'BBM naik 10%! 🚀 Rp 19.150/liter — cf. tip #2.';
    expect(sanitizeThreadText(s)).toBe(s);
  });

  it('preserves the {{PRODUCT_URL}} placeholder', () => {
    expect(sanitizeThreadText(`cek ${P} sekarang`)).toBe(`cek ${P} sekarang`);
  });

  it('collapses double spaces left by CJK removal', () => {
    expect(sanitizeThreadText('text巡航  more')).toBe('text more');
  });

  it('handles empty string', () => {
    expect(sanitizeThreadText('')).toBe('');
  });
});

describe('affiliate opener rule', () => {
  const product = { friendlyCode: 'ASH-001', name: 'Produk X', url: 'https://x.com', category: 'electronics' };
  const threadJson = {
    main: { id: 'main id', en: 'main en' },
    replies: [{ id: 'r1', en: 'r1 en' }, { id: 'r2', en: 'r2 en' }, { id: 'r3', en: 'r3 en' }]
  };

  it('thread prompt contains opener rule with btw/intermezzo variants', () => {
    const { system } = buildThreadPrompt(
      { topic: 't', platform: { slug: 'threads', maxChars: 280 }, tone: 'casual', audience: 'umum', ctaStyle: 'soft_sell', purpose: 'p', language: 'both', targetReplyCount: 7 },
      product
    );
    expect(system).toContain('AFFILIATE OPENER');
    expect(system).toContain('Btw,');
    expect(system).toContain('Intermezzo dulu ya,');
  });

  it('single-reply rewrite prompt contains opener rule + maxChars', () => {
    const { system } = buildSingleReplyRewritePrompt(
      { topic: 't', language: 'both', targetIndex: 2, threadJson, maxChars: 280 },
      product
    );
    expect(system).toContain('AFFILIATE OPENER');
    expect(system).toContain('280');
  });

  it('opener constants include ID + EN variants', () => {
    expect(AFFILIATE_OPENERS_ID).toContain('Btw,');
    expect(AFFILIATE_OPENERS_ID).toContain('Intermezzo dulu ya,');
    expect(AFFILIATE_OPENERS_EN).toContain('By the way,');
  });

  it('reply rule states 6 content + 1 affiliate for total 7', () => {
    const { system } = buildThreadPrompt(
      { topic: 't', platform: { slug: 'threads', maxChars: 280 }, tone: 'casual', audience: 'umum', ctaStyle: 'soft_sell', purpose: 'p', language: 'both', targetReplyCount: 7 },
      product
    );
    expect(system).toContain('EXACTLY 7 replies');
    expect(system).toContain('6 CONTENT');
  });

  it('small custom count falls back to generic rule (no negative content count)', () => {
    const { system } = buildThreadPrompt(
      { topic: 't', platform: { slug: 'threads', maxChars: 280 }, tone: 'casual', audience: 'umum', ctaStyle: 'soft_sell', purpose: 'p', language: 'both', targetReplyCount: 1 },
      product
    );
    expect(system).toContain('EXACTLY 1 replies');
    expect(system).not.toContain('0 CONTENT');
  });
});
