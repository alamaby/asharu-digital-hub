import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), {
    message: 'Must be a valid https:// URL'
  });

const siteUrlSchema = z.preprocess(emptyToUndefined, httpsUrl.default('https://asharu.id'));

const gaMeasurementIdSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^G-[A-Za-z0-9]+$/, 'GA4 Measurement ID must look like G-XXXXXXXXXX')
    .optional()
);

const whatsappUrlSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(
      /^https:\/\/wa\.me\/[0-9]{6,15}(\/[^\s?#]*)?(\?[^\s]*)?$/,
      'WhatsApp URL must look like https://wa.me/628123456789'
    )
    .optional()
);

const emailSchema = z.preprocess(
  emptyToUndefined,
  z.string().email('Must be a valid email address').optional()
);

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: siteUrlSchema,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: gaMeasurementIdSchema,
  NEXT_PUBLIC_WHATSAPP_URL: whatsappUrlSchema,
  NEXT_PUBLIC_CONTACT_EMAIL: emailSchema
});

export interface ParsedEnv {
  siteUrl: string;
  gaMeasurementId?: string;
  whatsappUrl?: string;
  contactEmail?: string;
}

/**
 * Pure parser so validation can be unit tested. Throws on invalid values so
 * builds fail early; optional variables left empty simply resolve to
 * `undefined` (feature disabled) instead of failing.
 */
export function parseEnv(raw: Record<string, string | undefined>): ParsedEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables — ${issues}`);
  }

  return {
    siteUrl: result.data.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, ''),
    gaMeasurementId: result.data.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    whatsappUrl: result.data.NEXT_PUBLIC_WHATSAPP_URL,
    contactEmail: result.data.NEXT_PUBLIC_CONTACT_EMAIL
  };
}

export const env: ParsedEnv = parseEnv(process.env as Record<string, string | undefined>);
