import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { pageHeading } from '@/lib/utils/title';

interface AboutPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.about' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/about',
    title: t('title'),
    description: t('description')
  });
}

export default async function AboutPage({ params }: AboutPageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const tMeta = await getTranslations({ locale, namespace: 'meta.about' });
  const t = await getTranslations({ locale, namespace: 'aboutPage' });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {pageHeading(tMeta('title'))}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-muted">{t('lead')}</p>

      <h2 className="mt-8 text-xl font-semibold text-ink">{t('purposeHeading')}</h2>
      <p className="mt-2 leading-relaxed text-ink-muted">{t('purposeBody')}</p>

      <h2 className="mt-8 text-xl font-semibold text-ink">{t('principlesHeading')}</h2>
      <p className="mt-2 leading-relaxed text-ink-muted">{t('principlesIntro')}</p>
      <ul className="mt-4 space-y-4">
        <li className="rounded-xl border border-line bg-surface p-4">
          <h3 className="text-base font-semibold text-primary">{t('principle1Title')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {t('principle1Body')}
          </p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <h3 className="text-base font-semibold text-primary">{t('principle2Title')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {t('principle2Body')}
          </p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <h3 className="text-base font-semibold text-primary">{t('principle3Title')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {t('principle3Body')}
          </p>
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-ink">{t('contactHeading')}</h2>
      <p className="mt-2 leading-relaxed text-ink-muted">
        {t('contactBody')}{' '}
        <Link
          href="/"
          className="font-medium text-primary underline underline-offset-4 hover:text-primary-dark"
        >
          asharu.id
        </Link>
      </p>
    </div>
  );
}
