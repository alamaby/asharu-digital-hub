import { describe, expect, it } from 'vitest';
import { buildMetadata } from './metadata';

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
});
