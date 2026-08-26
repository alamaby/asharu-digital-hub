// Placeholder data — Replace with verified production data before launch.
// (The Shopee entry below is already verified; see its inline comment.)
import type { ShopLink } from './schemas';

export const shopLinks: ShopLink[] = [
  {
    id: 'shopee',
    platform: 'shopee',
    // Verified production data — store name & URL confirmed by owner on 2026-08-25.
    name: { id: 'Asharu x Nopi.NY', en: 'Asharu x Nopi.NY' },
    description: {
      id: 'Belanja langsung produk Asharu di toko Shopee kami.',
      en: 'Shop Asharu products directly on our Shopee store.'
    },
    url: 'https://shopee.co.id/shop/9268731',
    // Affiliate-tracked share link — earns commission from external buyers
    // (never from your own purchases). shp.ee links may expire if edited in
    // the affiliate dashboard: refresh this value or delete the field to
    // fall back to `url`.
    affiliateUrl: 'https://id.shp.ee/u1L2EQuP',
    icon: 'bag'
  },
  {
    id: 'tokopedia',
    platform: 'tokopedia',
    hidden: true,
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
    hidden: true,
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
    hidden: true,
    name: { id: 'Website Toko Asharu', en: 'Asharu Store Website' },
    description: {
      id: 'Toko mandiri Asharu di luar marketplace.',
      en: "Asharu's own store outside marketplaces."
    },
    url: 'https://toko.asharu.id',
    icon: 'globe'
  }
];

/** Only verified, published stores reach the UI. */
export function getVisibleShopLinks(): ShopLink[] {
  return shopLinks.filter((link) => !link.hidden);
}
