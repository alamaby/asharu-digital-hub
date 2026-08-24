import { describe, expect, it } from 'vitest';
import sitemap from '../../app/sitemap';
import robots from '../../app/robots';

describe('sitemap', () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  it('contains both locales for every public route', () => {
    expect(urls).toContain('https://asharu.id/id/');
    expect(urls).toContain('https://asharu.id/en/');
    expect(urls).toContain('https://asharu.id/id/produk');
    expect(urls).toContain('https://asharu.id/en/products');
    expect(urls).toContain('https://asharu.id/id/properti');
    expect(urls).toContain('https://asharu.id/en/properties');
    expect(urls).toContain('https://asharu.id/id/tentang');
    expect(urls).toContain('https://asharu.id/en/about');
    expect(urls).toContain('https://asharu.id/id/kebijakan-privasi');
    expect(urls).toContain('https://asharu.id/id/disclosure-afiliasi');
  });

  it('includes every property listing in both locales', () => {
    expect(
      urls.filter((url) => url.startsWith('https://asharu.id/id/properti/')).length
    ).toBe(6);
    expect(
      urls.filter((url) => url.startsWith('https://asharu.id/en/properties/')).length
    ).toBe(6);
  });

  it('declares id/en/x-default alternates', () => {
    const home = entries.find((entry) => entry.url === 'https://asharu.id/id/');
    expect(home?.alternates?.languages).toMatchObject({
      en: 'https://asharu.id/en/',
      'x-default': 'https://asharu.id/id/'
    });
  });

  it('never exposes error or internal routes', () => {
    for (const url of urls) {
      expect(url).not.toMatch(/404|not-found|_next|api/);
    }
  });
});

describe('robots', () => {
  it('allows all crawlers and points to the production sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://asharu.id/sitemap.xml',
      host: 'https://asharu.id'
    });
  });
});
