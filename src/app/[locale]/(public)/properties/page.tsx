import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, propertyListSchema } from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { pageHeading } from '@/lib/utils/title';
import { getPublishedProperties } from '@/data/properties';
import { PropertyBrowser } from '@/components/cards/PropertyBrowser';
import { JsonLd } from '@/components/ui/JsonLd';

interface PropertiesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PropertiesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.properties' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/properties',
    title: t('title'),
    description: t('description')
  });
}

export default async function PropertiesPage({ params }: PropertiesPageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const tMeta = await getTranslations({ locale, namespace: 'meta.properties' });

  const breadcrumb = breadcrumbSchema([
    { name: 'Asharu', url: `${env.siteUrl}${localizedPathname('/', locale)}` },
    {
      name: pageHeading(tMeta('title')),
      url: `${env.siteUrl}${localizedPathname('/properties', locale)}`
    }
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {pageHeading(tMeta('title'))}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
        {tMeta('intro')}
      </p>

      <div className="mt-8">
        <PropertyBrowser properties={getPublishedProperties()} linkPosition="properties-grid" />
      </div>

      <JsonLd data={breadcrumb} />
      <JsonLd data={propertyListSchema(getPublishedProperties(), locale)} />
    </div>
  );
}
