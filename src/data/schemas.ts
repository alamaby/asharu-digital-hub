import { z } from 'zod';

/**
 * Shared entity schemas for static site data. Types are inferred from these
 * schemas and the datasets are validated in unit tests (see
 * `src/data/data.integrity.test.ts`).
 */

export const localizedTextSchema = z.object({
  id: z.string().min(1),
  en: z.string().min(1)
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'));

/* ------------------------------------------------------------------ shops */

export const shopPlatformSchema = z.enum([
  'shopee',
  'tokopedia',
  'tiktok-shop',
  'web-store'
]);
export type ShopPlatform = z.infer<typeof shopPlatformSchema>;

export const shopLinkSchema = z.object({
  id: z.string().min(1),
  platform: shopPlatformSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
  url: httpsUrl,
  icon: z.enum(['bag', 'store', 'video', 'globe'])
});
export type ShopLink = z.infer<typeof shopLinkSchema>;

/* ---------------------------------------------------------------- socials */

export const socialPlatformSchema = z.enum([
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'whatsapp'
]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

export const socialLinkSchema = z.object({
  id: z.string().min(1),
  platform: socialPlatformSchema,
  name: localizedTextSchema,
  handle: z.string().min(1),
  url: httpsUrl
});
export type SocialLink = z.infer<typeof socialLinkSchema>;

/* --------------------------------------------------------------- products */

export const productCategorySchema = z.enum([
  'electronics',
  'home-living',
  'fashion',
  'sports-hobby'
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const affiliateProductSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  category: productCategorySchema,
  description: localizedTextSchema,
  merchant: z.string().min(1),
  url: httpsUrl,
  image: z.string().startsWith('/images/'),
  featured: z.boolean()
});
export type AffiliateProduct = z.infer<typeof affiliateProductSchema>;

/* ------------------------------------------------------------- properties */

export const transactionTypeSchema = z.enum(['sale', 'rent']);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const propertyTypeSchema = z.enum([
  'house',
  'apartment',
  'land',
  'shop-house'
]);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const propertySchema = z.object({
  slug: slugSchema,
  title: localizedTextSchema,
  transactionType: transactionTypeSchema,
  propertyType: propertyTypeSchema,
  /** General area only — full addresses are never published (privacy). */
  location: localizedTextSchema,
  buildingAreaSqm: z.number().int().positive().optional(),
  landAreaSqm: z.number().int().positive().optional(),
  bedrooms: z.number().int().positive().optional(),
  bathrooms: z.number().int().positive().optional(),
  description: localizedTextSchema,
  image: z.string().startsWith('/images/'),
  featured: z.boolean()
});
export type Property = z.infer<typeof propertySchema>;
