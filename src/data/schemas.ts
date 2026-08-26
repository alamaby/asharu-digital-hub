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
  /** Clean, permanent destination URL. */
  url: httpsUrl,
  /**
   * Affiliate-tracked link (optional). When present, cards link here with
   * `rel="sponsored nofollow"`; delete the value to fall back to `url`.
   */
  affiliateUrl: httpsUrl.optional(),
  /** Short public handle shown on the card, e.g. `@namatoko` (optional). */
  handle: z.string().min(1).optional(),
  /**
   * Hide the card from the site while its URL/name is unverified
   * (data stays here as scaffold). Omit or set false to publish.
   */
  hidden: z.boolean().optional(),
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

export const galleryPhotoSchema = z.object({
  src: z.string().startsWith('/images/'),
  alt: localizedTextSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
export type GalleryPhoto = z.infer<typeof galleryPhotoSchema>;

export const propertyVideoSchema = z.object({
  src: z.string().startsWith('/videos/'),
  poster: z.string().startsWith('/images/'),
  title: localizedTextSchema
});
export type PropertyVideo = z.infer<typeof propertyVideoSchema>;

export const contactSchema = z.object({
  /** Human-readable display, e.g. "0813-2449-8379". */
  display: z.string().min(1),
  /** International digits for wa.me, e.g. "6281324498379". */
  international: z.string().regex(/^[0-9]{8,15}$/)
});

export const propertySchema = z.object({
  slug: slugSchema,
  title: localizedTextSchema,
  transactionType: transactionTypeSchema,
  propertyType: propertyTypeSchema,
  /** General area label shown on cards. */
  location: localizedTextSchema,
  buildingAreaSqm: z.number().int().positive().optional(),
  landAreaSqm: z.number().int().positive().optional(),
  bedrooms: z.number().int().positive().optional(),
  bathrooms: z.number().int().positive().optional(),
  description: localizedTextSchema,
  image: z.string().startsWith('/images/'),
  featured: z.boolean(),
  /**
   * Hide the listing while unverified (scaffold stays in the file).
   * Omit or set false to publish.
   */
  hidden: z.boolean().optional(),
  /**
   * Owner-verified price, shown publicly when present. `amount` feeds the
   * JSON-LD Offer (IDR); `label` is the human-readable display string.
   */
  price: z
    .object({
      amount: z.number().int().positive().optional(),
      label: localizedTextSchema,
      note: localizedTextSchema.optional()
    })
    .optional(),
  /** Listing availability; defaults to 'available'. */
  availability: z.enum(['available', 'occupied']).optional(),
  /** Owner-provided full address (published by the owner on the source LP). */
  addressFull: localizedTextSchema.optional(),
  gallery: z.array(galleryPhotoSchema).min(1).optional(),
  video: propertyVideoSchema.optional(),
  facilities: z.array(localizedTextSchema).optional(),
  highlights: z
    .array(
      z.object({
        title: localizedTextSchema,
        body: localizedTextSchema
      })
    )
    .optional(),
  nearbyPlaces: z
    .array(
      z.object({
        name: localizedTextSchema,
        /** Display string, e.g. "15 menit" / "15 min". */
        travelTime: localizedTextSchema.optional()
      })
    )
    .optional(),
  extraSpecs: z
    .array(
      z.object({
        label: localizedTextSchema,
        value: localizedTextSchema
      })
    )
    .optional(),
  faq: z
    .array(
      z.object({
        question: localizedTextSchema,
        answer: localizedTextSchema
      })
    )
    .optional(),
  contacts: z.array(contactSchema).optional(),
  mapsUrl: httpsUrl.optional(),
  disclaimers: z
    .object({
      page: localizedTextSchema.optional(),
      gallery: localizedTextSchema.optional()
    })
    .optional()
});
export type Property = z.infer<typeof propertySchema>;
