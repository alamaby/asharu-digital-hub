// Placeholder data — Replace with verified production data before launch.
// Prices, certificates and exact addresses are intentionally omitted.
// Locations are general areas only; all items are explicitly labeled as
// examples in the UI until verified data is supplied.
import type { Property } from './schemas';

export const properties: Property[] = [
  {
    slug: 'rumah-contoh-bandung',
    title: {
      id: 'Rumah Tropis Area Sukajadi',
      en: 'Tropical House in Sukajadi Area'
    },
    transactionType: 'sale',
    propertyType: 'house',
    location: { id: 'Sukajadi, Bandung', en: 'Sukajadi, Bandung' },
    buildingAreaSqm: 120,
    landAreaSqm: 90,
    bedrooms: 3,
    bathrooms: 2,
    description: {
      id: 'Rumah tinggal di area yang tenang, cocok untuk keluarga. Hubungi kami untuk penjadwalan survei.',
      en: 'A family home in a quiet area. Contact us to schedule a viewing.'
    },
    image: '/images/properties/property-placeholder-1.svg',
    featured: true
  },
  {
    slug: 'rumah-contoh-cibubur',
    title: {
      id: 'Rumah Keluarga Area Cibubur',
      en: 'Family House in Cibubur Area'
    },
    transactionType: 'sale',
    propertyType: 'house',
    location: { id: 'Cibubur, Jakarta Timur', en: 'Cibubur, East Jakarta' },
    buildingAreaSqm: 180,
    landAreaSqm: 150,
    bedrooms: 4,
    bathrooms: 3,
    description: {
      id: 'Rumah luas dengan carport dan taman. Detail lengkap tersedia melalui kontak resmi.',
      en: 'A spacious house with carport and garden. Full details available via official contact.'
    },
    image: '/images/properties/property-placeholder-2.svg',
    featured: true
  },
  {
    slug: 'apartemen-contoh-sudirman',
    title: {
      id: 'Apartemen Studio Area Sudirman',
      en: 'Studio Apartment in Sudirman Area'
    },
    transactionType: 'sale',
    propertyType: 'apartment',
    location: {
      id: 'Sudirman, Jakarta Selatan',
      en: 'Sudirman, South Jakarta'
    },
    buildingAreaSqm: 48,
    bedrooms: 1,
    bathrooms: 1,
    description: {
      id: 'Unit studio strategis dekat area bisnis. Hubungi untuk informasi harga.',
      en: 'A strategic studio unit near the business district. Contact us for pricing.'
    },
    image: '/images/properties/property-placeholder-3.svg',
    featured: false
  },
  {
    slug: 'tanah-contoh-cimahi',
    title: {
      id: 'Tanah Kavling Area Cimahi',
      en: 'Land Plot in Cimahi Area'
    },
    transactionType: 'sale',
    propertyType: 'land',
    location: { id: 'Cimahi, Jawa Barat', en: 'Cimahi, West Java' },
    landAreaSqm: 300,
    description: {
      id: 'Kavling tanah di kawasan yang berkembang. Data legalitas akan diverifikasi sebelum publikasi.',
      en: 'A land plot in a growing area. Legal data will be verified before publication.'
    },
    image: '/images/properties/property-placeholder-1.svg',
    featured: false
  },
  {
    slug: 'ruko-contoh-bekasi',
    title: {
      id: 'Ruko 2 Lantai Area Bekasi',
      en: 'Two-storey Shop House in Bekasi Area'
    },
    transactionType: 'rent',
    propertyType: 'shop-house',
    location: { id: 'Bekasi Selatan, Bekasi', en: 'South Bekasi, Bekasi' },
    buildingAreaSqm: 90,
    landAreaSqm: 60,
    bathrooms: 2,
    description: {
      id: 'Ruko strategis untuk usaha, dekat jalan utama. Hubungi untuk informasi sewa.',
      en: 'A strategic shop house for business, near the main road. Contact us for rental info.'
    },
    image: '/images/properties/property-placeholder-2.svg',
    featured: true
  },
  {
    slug: 'apartemen-contoh-setiabudi',
    title: {
      id: 'Apartemen 1 Kamar Area Setiabudi',
      en: 'One-bedroom Apartment in Setiabudi Area'
    },
    transactionType: 'rent',
    propertyType: 'apartment',
    location: {
      id: 'Setiabudi, Jakarta Selatan',
      en: 'Setiabudi, South Jakarta'
    },
    buildingAreaSqm: 36,
    bedrooms: 1,
    bathrooms: 1,
    description: {
      id: 'Unit sewa tahunan dengan akses mudah ke transportasi publik.',
      en: 'A yearly rental unit with easy access to public transport.'
    },
    image: '/images/properties/property-placeholder-3.svg',
    featured: true
  }
];

export function getFeaturedProperties(max = 6): Property[] {
  return properties.filter((property) => property.featured).slice(0, max);
}

export function getPropertyBySlug(slug: string): Property | undefined {
  return properties.find((property) => property.slug === slug);
}

export const propertyTransactionTypes = ['sale', 'rent'] as const;
export const propertyTypes = ['house', 'apartment', 'land', 'shop-house'] as const;
