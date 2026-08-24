import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { pageHeading } from '@/lib/utils/title';
import { formatDate } from '@/lib/utils/format';
import { DISCLOSURE_LAST_UPDATED } from '@/config/content';

interface DisclosurePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: DisclosurePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.disclosure' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/affiliate-disclosure',
    title: t('title'),
    description: t('description')
  });
}

export default async function DisclosurePage({ params }: DisclosurePageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const tMeta = await getTranslations({ locale, namespace: 'meta.disclosure' });
  const t = await getTranslations({ locale, namespace: 'disclosurePage' });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {pageHeading(tMeta('title'))}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {t('updated', { date: formatDate(DISCLOSURE_LAST_UPDATED, locale) })}
      </p>
      <p className="mt-4 leading-relaxed text-ink-muted">{t('intro')}</p>

      {(
        [
          ['howHeading', ['howP1', 'howP2']],
          ['pricingHeading', ['pricingP1']],
          ['independenceHeading', ['independenceP1']],
          ['questionsHeading', ['questionsP1']]
        ] as const
      ).map(([headingKey, paragraphKeys]) => (
        <section key={headingKey} className="mt-8">
          <h2 className="text-xl font-semibold text-ink">{t(headingKey)}</h2>
          {paragraphKeys.map((paragraphKey) => (
            <p key={paragraphKey} className="mt-2 leading-relaxed text-ink-muted">
              {t(paragraphKey)}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
