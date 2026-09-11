import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { pickClientMessages } from '@/lib/i18n/client-messages';
import { DEFAULT_TIMEZONE } from '@/lib/utils/format';
import type { Metadata } from 'next';
import '../globals.css';
import { TimezoneSync } from '@/components/layout/TimezoneSync';

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

/**
 * Root locale layout — disengaja ramping: hanya font, i18n provider, dan
 * sinkronisasi zona waktu. Chrome publik (Header/Footer/analytics) tinggal
 * di `(public)/layout`, shell admin di `(admin)/layout`, sehingga area
 * non-publik tidak mewarisi chrome pemasaran.
 *
 * PENTING SSG: jangan baca cookie/header di sini — itu akan memaksa seluruh
 * subtree (`/id`, `/en`) menjadi dinamis dan tag `<head>` mengalir via
 * Flight, tak terlihat crawler tanpa-JS.
 */
export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = pickClientMessages(await getMessages());

  // Static default: user/device timezone resolution happens client-side
  // (TimezoneSync). Reading request cookies here would opt every route into
  // dynamic rendering, which streams <head> metadata via the Flight payload
  // instead of literal <head> HTML — invisible to crawlers that skip JS
  // (e.g. Meta domain verification). Pages needing the resolved timezone
  // call getDisplayTimezone() themselves (see src/lib/auth/timezone.ts).
  const timeZone = DEFAULT_TIMEZONE;

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-background text-ink">
        <NextIntlClientProvider messages={messages} timeZone={timeZone}>
          <TimezoneSync />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
