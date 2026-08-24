import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Asharu',
    short_name: 'Asharu',
    description:
      'Digital hub Asharu — toko online, produk pilihan, media sosial, dan properti dalam satu tempat.',
    start_url: '/',
    display: 'browser',
    background_color: '#F8FAFC',
    theme_color: '#075985',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      }
    ]
  };
}
