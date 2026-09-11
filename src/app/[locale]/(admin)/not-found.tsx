import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';
import { NotFoundContent } from '@/components/ui/NotFoundContent';

interface NotFoundPageProps {
  params?: Promise<{ locale: string }>;
}

async function resolveLocale(params?: NotFoundPageProps['params']): Promise<string> {
  if (!params) return routing.defaultLocale;
  const { locale } = await params;
  return routing.locales.includes(locale as never) ? locale : routing.defaultLocale;
}

export async function generateMetadata({ params }: NotFoundPageProps): Promise<Metadata> {
  const t = await getTranslations({
    locale: await resolveLocale(params),
    namespace: 'meta.notFound'
  });
  return {
    metadataBase: new URL(env.siteUrl),
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  };
}

export default async function AdminNotFoundPage({ params }: NotFoundPageProps) {
  setRequestLocale(await resolveLocale(params));
  return <NotFoundContent />;
}
