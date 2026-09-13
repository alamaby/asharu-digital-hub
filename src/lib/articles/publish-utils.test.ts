import { describe, expect, it } from 'vitest';
import { renderArticleMarkdown } from './types';
import { resolveUniqueSlug, selectPublishLocales } from './publish-utils';

describe('resolveUniqueSlug', () => {
  it('pakai base bila belum dipakai', () => {
    expect(resolveUniqueSlug('tips-keyboard', new Set(['lain']))).toBe('tips-keyboard');
  });

  it('tambah suffix -2, -3 bila tabrakan', () => {
    expect(resolveUniqueSlug('tips-keyboard', new Set(['tips-keyboard', 'tips-keyboard-2']))).toBe('tips-keyboard-3');
  });
});

describe('selectPublishLocales', () => {
  it('sesi both/null membolehkan keduanya', () => {
    expect(selectPublishLocales('both', ['id', 'en'])).toEqual({ locales: ['id', 'en'] });
    expect(selectPublishLocales(null, ['id'])).toEqual({ locales: ['id'] });
  });

  it('sesi tunggal menolak bahasa lain', () => {
    const res = selectPublishLocales('id', ['id', 'en']);
    expect(res).toHaveProperty('error');
  });

  it('menolak request kosong', () => {
    expect(selectPublishLocales('both', [] as never[])).toHaveProperty('error');
  });

  it('dedup bahasa ganda', () => {
    expect(selectPublishLocales('both', ['id', 'id'])).toEqual({ locales: ['id'] });
  });
});

describe('renderArticleMarkdown', () => {
  it('render excerpt + H2 sections', () => {
    const md = renderArticleMarkdown({
      title: 'T',
      slug: 't',
      excerpt: 'Intro singkat.',
      sections: [{ h2: 'Bagian satu', body: 'Isi satu.' }],
      faq: [],
      meta_title: 'T',
      meta_desc: 'D'
    });
    expect(md).toContain('Intro singkat.');
    expect(md).toContain('## Bagian satu');
    expect(md).toContain('Isi satu.');
  });
});
