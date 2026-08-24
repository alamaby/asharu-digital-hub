import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';

export const siteConfig = {
  name: 'Asharu',
  domain: 'asharu.id',
  url: env.siteUrl,
  defaultLocale: routing.defaultLocale,
  locales: routing.locales
} as const;

/** Contact channels are env-driven and optional; hide CTAs until configured. */
export const contactConfig = {
  whatsappUrl: env.whatsappUrl,
  email: env.contactEmail
} as const;
