import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';
import { buildMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/ui/JsonLd';
import { organizationSchema, websiteSchema } from '@/lib/seo/jsonld';
import { SkipLink } from '@/components/layout/SkipLink';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { PageViewTracker } from '@/components/analytics/PageViewTracker';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
});

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: Omit<LocaleLayoutProps, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.home' });
  return buildMetadata({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    path: '/',
    title: t('title'),
    description: t('description')
  });
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.variable}>
      <body className="flex min-h-dvh flex-col bg-background text-ink">
        <NextIntlClientProvider messages={messages}>
          <SkipLink />
          <Header />
          <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <Footer showAnalyticsPrefs={Boolean(env.gaMeasurementId)} />
          <ConsentBanner enabled={Boolean(env.gaMeasurementId)} />
          {env.gaMeasurementId ? (
            <>
              <GoogleAnalytics measurementId={env.gaMeasurementId} />
              <PageViewTracker />
            </>
          ) : null}
          <JsonLd data={websiteSchema()} />
          <JsonLd data={organizationSchema()} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
