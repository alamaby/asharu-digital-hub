import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { LoginForm } from '@/components/auth/LoginForm';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.masuk' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/masuk',
    title: t('title'),
    description: t('description')
  });
}

export default async function LoginPage({ params }: LoginPageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'auth.login' });

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {t('title')}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">{t('intro')}</p>
      <div className="mt-8">
        <LoginForm />
      </div>
    </div>
  );
}
