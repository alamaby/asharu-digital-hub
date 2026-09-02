import { describe, expect, it } from 'vitest';
import { normalizePlaceholder, parseThread } from './thread';

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
    expect(out!.main.en).toBe('hi ');
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

  it('returns null when replies exceed max 5', () => {
    const replies = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, en: `r${i} en` }));
    replies[0]!.id = `r0 ${P}`;
    const raw = JSON.stringify({
      main: { id: 'm', en: 'm en' },
      replies
    });
    expect(parseThread(raw)).toBeNull();
  });

  it('regression: 2 placeholders split across main.id + main.en now parses (previously failed)', () => {
    const raw = JSON.stringify({
      main: { id: `cek di sini ya ${P}`, en: `tap here ${P}` },
      replies: [{ id: 'reply id', en: 'reply en' }]
    });
    const out = parseThread(raw);
    expect(out).not.toBeNull();
    expect(out!.main.id).toBe(`cek di sini ya ${P}`);
    expect(out!.main.en).toBe('tap here ');
  });
});
