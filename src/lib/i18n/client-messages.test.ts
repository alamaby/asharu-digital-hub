import { describe, expect, it } from 'vitest';
import { pickClientMessages } from './client-messages';
import type { AbstractIntlMessages } from 'next-intl';

const catalog = {
  header: { skipToContent: 'x', language: 'y' },
  nav: { home: 'Beranda' },
  property: {
    sale: 'Dijual',
    gallery: { heading: 'Galeri' }
  },
  footer: { rights: '© {year}' },
  meta: { home: { title: 'T' } }
} as unknown as AbstractIntlMessages;

describe('pickClientMessages', () => {
  it('keeps only allow-listed namespaces (deep objects intact)', () => {
    const picked = pickClientMessages(catalog);
    expect(Object.keys(picked).sort()).toEqual(['header', 'nav', 'property']);
    expect(picked.property).toEqual(catalog.property);
  });

  it('skips namespaces missing from the catalog', () => {
    const picked = pickClientMessages({ header: { a: 'b' } });
    expect(Object.keys(picked)).toEqual(['header']);
  });

  it('supports a custom namespace list', () => {
    const picked = pickClientMessages(catalog, ['footer', 'meta']);
    expect(Object.keys(picked).sort()).toEqual(['footer', 'meta']);
  });

  it('returns an empty object when nothing matches', () => {
    expect(pickClientMessages({ unrelated: {} })).toEqual({});
  });
});
