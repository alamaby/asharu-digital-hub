import { describe, expect, it } from 'vitest';
import {
  FACEBOOK_DOMAIN_VERIFICATION_TOKEN,
  buildMetadata,
  truncateAtWord
} from './metadata';

describe('buildMetadata', () => {
  const base = {
    title: 'Produk Afiliasi Pilihan | Asharu',
    description: 'Deskripsi'
  };

  it('builds canonical + hreflang for a static path', () => {
    const metadata = buildMetadata({ locale: 'id', path: '/products', ...base });

    expect(metadata.metadataBase?.toString()).toBe('https://asharu.id/');
    expect(metadata.alternates?.canonical).toBe('https://asharu.id/id/produk');
    expect(metadata.alternates?.languages).toEqual({
      id: 'https://asharu.id/id/produk',
      en: 'https://asharu.id/en/products',
      'x-default': 'https://asharu.id/id/produk'
    });
  });

  it('resolves dynamic params for localized detail URLs', () => {
    const metadata = buildMetadata({
      locale: 'en',
      path: '/properties/[slug]',
      params: { slug: 'rumah-contoh-bandung' },
      title: 'T',
      description: 'D'
    });

    expect(metadata.alternates?.canonical).toBe(
      'https://asharu.id/en/properties/rumah-contoh-bandung'
    );
    expect(metadata.alternates?.languages).toMatchObject({
      id: 'https://asharu.id/id/properti/rumah-contoh-bandung',
      'x-default': 'https://asharu.id/id/properti/rumah-contoh-bandung'
    });
  });

  it('emits Open Graph and Twitter card data', () => {
    const metadata = buildMetadata({ locale: 'en', path: '/', ...base });
    expect(metadata.openGraph).toMatchObject({
      siteName: 'Asharu',
      locale: 'en_US',
      alternateLocale: 'id_ID'
    });
    const twitter = metadata.twitter as { card?: string };
    expect(twitter.card).toBe('summary_large_image');
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('emits the Meta Business domain verification tag', () => {
    const metadata = buildMetadata({ locale: 'id', path: '/', ...base });
    expect(FACEBOOK_DOMAIN_VERIFICATION_TOKEN).toBe('wt9cbx9npb6njy0lcqrpe85dal7pmz');
    expect(metadata.other).toMatchObject({
      'facebook-domain-verification': 'wt9cbx9npb6njy0lcqrpe85dal7pmz'
    });
  });

  it('article option emits og:type article + times + image alt (og & twitter)', () => {
    const metadata = buildMetadata({
      locale: 'id',
      path: '/artikel/[slug]',
      params: { slug: 'contoh' },
      ...base,
      article: {
        publishedTime: '2026-09-15T01:49:26.714Z',
        modifiedTime: '2026-09-15T02:00:00.000Z',
        ogImage: {
          url: 'https://cdn.example.com/cover.png',
          alt: 'Judul Artikel'
        }
      }
    });
    const og = metadata.openGraph as {
      type: string;
      publishedTime?: string;
      modifiedTime?: string;
      images?: Array<{ url: string; alt?: string }>;
    };
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBe('2026-09-15T01:49:26.714Z');
    expect(og.modifiedTime).toBe('2026-09-15T02:00:00.000Z');
    expect(og.images).toEqual([
      { url: 'https://cdn.example.com/cover.png', alt: 'Judul Artikel' }
    ]);
    expect(metadata.alternates?.canonical).toBe(
      'https://asharu.id/id/artikel/contoh'
    );
    const twitter = metadata.twitter as {
      card?: string;
      images?: Array<{ url: string; alt?: string }>;
    };
    expect(twitter.card).toBe('summary_large_image');
    expect(twitter.images).toEqual([
      { url: 'https://cdn.example.com/cover.png', alt: 'Judul Artikel' }
    ]);
  });

  it('tanpa opsi article, og tetap website tanpa image', () => {
    const metadata = buildMetadata({ locale: 'id', path: '/', ...base });
    const og = metadata.openGraph as { type: string; images?: unknown };
    expect(og.type).toBe('website');
    expect(og.images).toBeUndefined();
  });
});

describe('truncateAtWord', () => {
  it('teks pendek dikembalikan apa adanya', () => {
    expect(truncateAtWord('Halo dunia', 160)).toBe('Halo dunia');
  });

  it('potong di batas kata terakhir, bukan tengah kata', () => {
    const text = 'abcde '.repeat(60);
    const out = truncateAtWord(text, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(' ')).toBe(false);
    // Batas kata: karakter setelah potongan di teks asli harus spasi.
    expect(text.charAt(out.length)).toBe(' ');
    // Semua token hasil adalah kata utuh sumber.
    expect(new Set(out.split(' '))).toEqual(new Set(['abcde']));
  });

  it('tanpa spasi di potongan, jatuh ke slice keras di batas max', () => {
    const noSpace = 'a'.repeat(300);
    expect(truncateAtWord(noSpace, 100)).toHaveLength(100);
  });
});
