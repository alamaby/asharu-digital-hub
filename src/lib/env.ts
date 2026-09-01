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

// Supabase — required because the content-factory workflow reads the affiliate
// catalog and the content-request insert at build/render time. Empty values
// are allowed via emptyToUndefined so existing pages still build when the
// env is not yet provisioned; pages that require Supabase check `env.hasSupabase`.
const supabaseUrlSchema = z.preprocess(
  emptyToUndefined,
  httpsUrl.refine((value) => /\.supabase\.co$/.test(new URL(value).hostname), {
    message: 'Must be a Supabase project URL (https://xxx.supabase.co)'
  }).optional()
);
const supabaseAnonKeySchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .min(20, 'Supabase anon key looks too short')
    .refine(
      (v) => v.startsWith('eyJ') || v.startsWith('sb_publishable_'),
      'Must be a JWT (eyJ...) or sb_publishable_... (anon deprecated, use sb_publishable_...)'
    )
    .optional()
);
const supabasePublishableKeySchema = supabaseAnonKeySchema;
const supabaseSecretKeySchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .min(20, 'Supabase secret key looks too short')
    .refine(
      (v) => v.startsWith('eyJ') || v.startsWith('sb_secret_'),
      'Must be a JWT (eyJ...) or sb_secret_... (service_role deprecated end 2025)'
    )
    .optional()
);
const cronSecretSchema = z.preprocess(
  emptyToUndefined,
  z.string().min(10, 'Cron secret looks too short').optional()
);

// Tavily search key — preferred source is Supabase Vault (`tavily_api_key`,
// read via vault_decrypt_secret_by_name); this env var is the local-dev /
// fallback path. Optional so builds succeed when neither is set yet.
const tavilyApiKeySchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .min(20, 'Tavily API key looks too short')
    .refine((value) => value.startsWith('tvly-'), {
      message: 'Tavily API key must start with tvly-'
    })
    .optional()
);

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: siteUrlSchema,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: gaMeasurementIdSchema,
  NEXT_PUBLIC_WHATSAPP_URL: whatsappUrlSchema,
  NEXT_PUBLIC_CONTACT_EMAIL: emailSchema,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKeySchema,
  // Deprecated alias — will be removed after anon deprecation. Prefer NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKeySchema,
  SUPABASE_SECRET_KEY: supabaseSecretKeySchema,
  // Deprecated alias — will be removed after 2025-12. Prefer SUPABASE_SECRET_KEY.
  SUPABASE_SERVICE_ROLE_KEY: supabaseSecretKeySchema,
  CRON_SECRET: cronSecretSchema,
  TAVILY_API_KEY: tavilyApiKeySchema
});

export interface ParsedEnv {
  siteUrl: string;
  gaMeasurementId?: string;
  whatsappUrl?: string;
  contactEmail?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** @deprecated Use supabasePublishableKey — kept for backward compat */
  supabaseAnonKeyDeprecated?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  /** @deprecated Use supabaseSecretKey — kept for backward compat */
  supabaseServiceRoleKey?: string;
  cronSecret?: string;
  tavilyApiKey?: string;
  hasSupabase: boolean;
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

  const secretKey =
    result.data.SUPABASE_SECRET_KEY ?? result.data.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey =
    result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    siteUrl: result.data.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, ''),
    gaMeasurementId: result.data.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    whatsappUrl: result.data.NEXT_PUBLIC_WHATSAPP_URL,
    contactEmail: result.data.NEXT_PUBLIC_CONTACT_EMAIL,
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: publishableKey,
    supabaseAnonKeyDeprecated: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabasePublishableKey: publishableKey,
    supabaseSecretKey: secretKey,
    supabaseServiceRoleKey: secretKey,
    cronSecret: result.data.CRON_SECRET,
    tavilyApiKey: result.data.TAVILY_API_KEY,
    hasSupabase: Boolean(
      result.data.NEXT_PUBLIC_SUPABASE_URL && publishableKey
    )
  };
}

export const env: ParsedEnv = parseEnv(process.env as Record<string, string | undefined>);
