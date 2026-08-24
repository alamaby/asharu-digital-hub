import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, Info, Mail, MessageCircle } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, realEstateListingSchema } from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { formatArea } from '@/lib/utils/format';
import { getPropertyBySlug, properties } from '@/data/properties';
import { contactConfig } from '@/config/site';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { ViewPropertyTracker } from '@/components/analytics/ViewPropertyTracker';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { JsonLd } from '@/components/ui/JsonLd';

interface PropertyDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    properties.map((property) => ({ locale, slug: property.slug }))
  );
}

export const dynamicParams = false;

export async function generateMetadata({
  params
}: PropertyDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const property = getPropertyBySlug(slug);
  if (!property) return {};
  return buildMetadata({
    locale: locale as Locale,
    path: '/properties/[slug]',
    params: { slug },
    title: `${property.title[locale as Locale]} | Asharu`,
    description: property.description[locale as Locale]
  });
}

export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  const { slug } = await params;
  setRequestLocale(locale);

  const property = getPropertyBySlug(slug);
  if (!property) notFound();

  const tProperty = await getTranslations({ locale, namespace: 'property' });
  const tPage = await getTranslations({ locale, namespace: 'propertyPage' });

  const statusChip =
    property.transactionType === 'sale'
      ? 'chip bg-primary/10 text-primary'
      : 'chip bg-accent/10 text-accent-dark';

  interface SpecRow {
    label: string;
    value: string;
  }

  const specRows: SpecRow[] = [];
  if (property.buildingAreaSqm !== undefined) {
    specRows.push({
      label: tProperty('specBuildingArea'),
      value: formatArea(property.buildingAreaSqm, locale)
    });
  }
  if (property.landAreaSqm !== undefined) {
    specRows.push({
      label: tProperty('specLandArea'),
      value: formatArea(property.landAreaSqm, locale)
    });
  }
  if (property.bedrooms !== undefined) {
    specRows.push({
      label: tProperty('specBedrooms'),
      value: String(property.bedrooms)
    });
  }
  if (property.bathrooms !== undefined) {
    specRows.push({
      label: tProperty('specBathrooms'),
      value: String(property.bathrooms)
    });
  }

  const breadcrumb = breadcrumbSchema([
    { name: 'Asharu', url: `${env.siteUrl}${localizedPathname('/', locale)}` },
    {
      name: tPage('listTitle'),
      url: `${env.siteUrl}${localizedPathname('/properties', locale)}`
    },
    {
      name: property.title[locale],
      url: `${env.siteUrl}${localizedPathname('/properties/[slug]', locale, { slug })}`
    }
  ]);

  return (
    <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/properties"
        className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-dark"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {tPage('backToList')}
      </Link>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="relative aspect-[3/2] bg-background">
          <ResponsiveImage
            src={property.image}
            alt={property.title[locale]}
            width={1200}
            height={800}
            sizes="(max-width: 896px) 100vw, 896px"
            priority
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <div className="space-y-5 p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className={statusChip}>
              {property.transactionType === 'sale'
                ? tProperty('sale')
                : tProperty('rent')}
            </span>
            <span className="text-sm text-ink-muted">{property.location[locale]}</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {property.title[locale]}
          </h1>

          <p className="inline-flex items-start gap-2 rounded-lg border border-line bg-background p-3 text-sm text-ink-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {tProperty('exampleNotice')}
          </p>

          {specRows.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold text-ink">{tPage('specsHeading')}</h2>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {specRows.map((spec) => (
                  <div
                    key={spec.label}
                    className="rounded-lg border border-line bg-surface p-3"
                  >
                    <dt className="text-xs uppercase tracking-wide text-ink-muted">
                      {spec.label}
                    </dt>
                    <dd className="mt-1 text-base font-semibold text-ink">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}

          <p className="leading-relaxed text-ink-muted">{property.description[locale]}</p>

          <div className="rounded-xl border border-line bg-background p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-ink">
              {tPage('detailContactHeading')}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {tPage('detailContactDescription')}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {contactConfig.whatsappUrl ? (
                <TrackedExternalLink
                  href={contactConfig.whatsappUrl}
                  event="click_property_contact"
                  params={{ item_id: property.slug, link_position: 'property-detail' }}
                  aria-label={tProperty('whatsappAria', { title: property.title[locale] })}
                  className="btn-primary"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  {tProperty('whatsappCta')}
                </TrackedExternalLink>
              ) : null}
              {contactConfig.email ? (
                <ExternalLink
                  href={`mailto:${contactConfig.email}`}
                  aria-label="Email Asharu"
                  className="btn-secondary"
                >
                  <Mail className="size-4" aria-hidden />
                  Email
                </ExternalLink>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <ViewPropertyTracker itemId={property.slug} />
      <JsonLd data={realEstateListingSchema(property, locale)} />
      <JsonLd data={breadcrumb} />
    </article>
  );
}
