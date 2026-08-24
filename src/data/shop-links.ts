// Placeholder data — Replace with verified production data before launch.
import type { ShopLink } from './schemas';

export const shopLinks: ShopLink[] = [
  {
    id: 'shopee',
    platform: 'shopee',
    name: { id: 'Toko Shopee Asharu', en: 'Asharu Shopee Store' },
    description: {
      id: 'Kunjungi toko resmi Asharu di Shopee.',
      en: 'Visit the official Asharu store on Shopee.'
    },
    url: 'https://shopee.co.id/asharu',
    icon: 'bag'
  },
  {
    id: 'tokopedia',
    platform: 'tokopedia',
    name: { id: 'Toko Tokopedia Asharu', en: 'Asharu Tokopedia Store' },
    description: {
      id: 'Kunjungi toko resmi Asharu di Tokopedia.',
      en: 'Visit the official Asharu store on Tokopedia.'
    },
    url: 'https://www.tokopedia.com/asharu',
    icon: 'store'
  },
  {
    id: 'tiktok-shop',
    platform: 'tiktok-shop',
    name: { id: 'TikTok Shop Asharu', en: 'Asharu TikTok Shop' },
    description: {
      id: 'Lihat produk Asharu di TikTok Shop.',
      en: 'Browse Asharu products on TikTok Shop.'
    },
    url: 'https://shop.tiktok.com/asharu',
    icon: 'video'
  },
  {
    id: 'web-store',
    platform: 'web-store',
    name: { id: 'Website Toko Asharu', en: 'Asharu Store Website' },
    description: {
      id: 'Toko mandiri Asharu di luar marketplace.',
      en: "Asharu's own store outside marketplaces."
    },
    url: 'https://toko.asharu.id',
    icon: 'globe'
  }
];
