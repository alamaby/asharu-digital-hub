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
    description: t('description'),
    robots: { index: false, follow: false }
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
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 sm:px-6">
      <p className="text-2xl font-bold tracking-tight text-brand-500 dark:text-brand-400" aria-hidden>
        Asharu<span className="text-orange-400">.</span>
      </p>
      <section
        aria-labelledby="masuk-heading"
        className="mt-6 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none"
      >
        <div className="h-1.5 bg-gradient-to-r from-brand-500 via-theme-purple-500 to-theme-pink-500" aria-hidden />
        <div className="p-6 sm:p-8">
          <h1 id="masuk-heading" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('intro')}</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </section>
    </div>
  );
}
