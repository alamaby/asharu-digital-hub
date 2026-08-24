// Placeholder data — Replace with verified production data before launch.
// Prices are intentionally omitted: cards always show "check latest price"
// and the price-change notice instead of unverified numbers.
import type { AffiliateProduct } from './schemas';

export const affiliateProducts: AffiliateProduct[] = [
  {
    id: 'product-01',
    name: {
      id: 'Smartwatch Aktivitas Harian',
      en: 'Daily Activity Smartwatch'
    },
    category: 'electronics',
    description: {
      id: 'Jam tangan pintar untuk memantau aktivitas harian Anda.',
      en: 'A smartwatch to track your daily activities.'
    },
    merchant: 'Merchant A (contoh)',
    url: 'https://www.example-merchant.example/product-01',
    image: '/images/products/product-placeholder-1.svg',
    featured: true
  },
  {
    id: 'product-02',
    name: {
      id: 'Speaker Bluetooth Portabel',
      en: 'Portable Bluetooth Speaker'
    },
    category: 'electronics',
    description: {
      id: 'Speaker portabel yang praktis untuk kebutuhan hiburan sehari-hari.',
      en: 'A practical portable speaker for everyday entertainment.'
    },
    merchant: 'Merchant A (contoh)',
    url: 'https://www.example-merchant.example/product-02',
    image: '/images/products/product-placeholder-2.svg',
    featured: true
  },
  {
    id: 'product-03',
    name: {
      id: 'Lampu Meja LED Minimalis',
      en: 'Minimalist LED Desk Lamp'
    },
    category: 'home-living',
    description: {
      id: 'Lampu meja dengan desain sederhana untuk ruang kerja Anda.',
      en: 'A simply designed desk lamp for your workspace.'
    },
    merchant: 'Merchant B (contoh)',
    url: 'https://www.example-merchant.example/product-03',
    image: '/images/products/product-placeholder-3.svg',
    featured: true
  },
  {
    id: 'product-04',
    name: {
      id: 'Rak Penyimpanan Serbaguna',
      en: 'Multi-purpose Storage Rack'
    },
    category: 'home-living',
    description: {
      id: 'Rak serbaguna untuk merapikan ruang di rumah Anda.',
      en: 'A versatile rack to tidy up your home.'
    },
    merchant: 'Merchant B (contoh)',
    url: 'https://www.example-merchant.example/product-04',
    image: '/images/products/product-placeholder-1.svg',
    featured: false
  },
  {
    id: 'product-05',
    name: {
      id: 'Kemeja Katun Kasual Pria',
      en: "Men's Casual Cotton Shirt"
    },
    category: 'fashion',
    description: {
      id: 'Kemeja katun nyaman untuk aktivitas santai.',
      en: 'A comfortable cotton shirt for casual wear.'
    },
    merchant: 'Merchant C (contoh)',
    url: 'https://www.example-merchant.example/product-05',
    image: '/images/products/product-placeholder-2.svg',
    featured: true
  },
  {
    id: 'product-06',
    name: {
      id: 'Tas Ransel Serbaguna',
      en: 'Versatile Backpack'
    },
    category: 'fashion',
    description: {
      id: 'Ransel serbaguna untuk harian maupun perjalanan.',
      en: 'A versatile backpack for daily use and travel.'
    },
    merchant: 'Merchant C (contoh)',
    url: 'https://www.example-merchant.example/product-06',
    image: '/images/products/product-placeholder-3.svg',
    featured: false
  },
  {
    id: 'product-07',
    name: {
      id: 'Matras Yoga Anti-Selip',
      en: 'Non-slip Yoga Mat'
    },
    category: 'sports-hobby',
    description: {
      id: 'Matras olahraga dengan permukaan anti-selip.',
      en: 'A sports mat with a non-slip surface.'
    },
    merchant: 'Merchant D (contoh)',
    url: 'https://www.example-merchant.example/product-07',
    image: '/images/products/product-placeholder-1.svg',
    featured: true
  },
  {
    id: 'product-08',
    name: {
      id: 'Set Dumbel yang Dapat Diatur',
      en: 'Adjustable Dumbbell Set'
    },
    category: 'sports-hobby',
    description: {
      id: 'Set dumbel dengan berat yang dapat disesuaikan.',
      en: 'A dumbbell set with adjustable weight.'
    },
    merchant: 'Merchant D (contoh)',
    url: 'https://www.example-merchant.example/product-08',
    image: '/images/products/product-placeholder-2.svg',
    featured: false
  }
];

export function getFeaturedProducts(max = 6): AffiliateProduct[] {
  return affiliateProducts.filter((product) => product.featured).slice(0, max);
}
