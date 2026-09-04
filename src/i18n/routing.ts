import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['id', 'en'],
  defaultLocale: 'id',
  // Always-prefixed URLs (no locale-less routes) keep a single canonical URL
  // per page. localeDetection is disabled so `/` deterministically redirects
  // to `/id` for users and crawlers alike.
  localePrefix: 'always',
  localeDetection: false,
  pathnames: {
    '/': '/',
    '/products': {
      id: '/produk',
      en: '/products'
    },
    '/properties': {
      id: '/properti',
      en: '/properties'
    },
    '/properties/[slug]': {
      id: '/properti/[slug]',
      en: '/properties/[slug]'
    },
    '/about': {
      id: '/tentang',
      en: '/about'
    },
    '/privacy-policy': {
      id: '/kebijakan-privasi',
      en: '/privacy-policy'
    },
    '/affiliate-disclosure': {
      id: '/disclosure-afiliasi',
      en: '/affiliate-disclosure'
    },
    '/masuk': {
      id: '/masuk',
      en: '/sign-in'
    },
    '/konten/baru': {
      id: '/konten/baru',
      en: '/content/new'
    },
    '/konten/review': {
      id: '/konten/review',
      en: '/content/review'
    },
    '/konten/review/[draftId]': {
      id: '/konten/review/[draftId]',
      en: '/content/review/[draftId]'
    },
    '/admin': {
      id: '/admin',
      en: '/admin'
    },
    '/admin/konten': {
      id: '/admin/konten',
      en: '/admin/content'
    },
    '/admin/riset': {
      id: '/admin/riset',
      en: '/admin/research'
    },
    '/admin/riset/[sessionId]': {
      id: '/admin/riset/[sessionId]',
      en: '/admin/research/[sessionId]'
    },
    '/admin/riset/[sessionId]/topics/[topicId]': {
      id: '/admin/riset/[sessionId]/topics/[topicId]',
      en: '/admin/research/[sessionId]/topics/[topicId]'
    },
    '/admin/llm': {
      id: '/admin/llm',
      en: '/admin/llm'
    },
    '/admin/llm/logs': {
      id: '/admin/llm/logs',
      en: '/admin/llm/logs'
    },
    '/admin/llm/[providerId]': {
      id: '/admin/llm/[providerId]',
      en: '/admin/llm/[providerId]'
    },
    '/auth/exchange': {
      id: '/autentikasi/pertukaran',
      en: '/auth/exchange'
    }
  }
});

export type Locale = (typeof routing.locales)[number];
