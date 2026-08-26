import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  ArrowLeft,
  Bath,
  BedDouble,
  ExternalLink as ExternalLinkIcon,
  Info,
  Mail,
  MapPin,
  Maximize,
  MessageCircle,
  Ruler
} from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  breadcrumbSchema,
  faqSchema,
  realEstateListingSchema
} from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { formatArea } from '@/lib/utils/format';
import {
  getPublishedProperties,
  getPublishedPropertyBySlug
} from '@/data/properties';
import { contactConfig } from '@/config/site';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { ViewPropertyTracker } from '@/components/analytics/ViewPropertyTracker';
import { PropertyGallery } from '@/components/cards/PropertyGallery';
import { JsonLd } from '@/components/ui/JsonLd';

interface PropertyDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getPublishedProperties().map((property) => ({
      locale,
      slug: property.slug
    }))
  );
}

export const dynamicParams = false;

export async function generateMetadata({
  params
}: PropertyDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const property = getPublishedPropertyBySlug(slug);
  if (!property) return {};
  const metadata = buildMetadata({
    locale: locale as Locale,
    path: '/properties/[slug]',
    params: { slug },
    title: `${property.title[locale as Locale]} | Asharu`,
    description: property.description[locale as Locale]
  });
  if (metadata.openGraph && property.gallery?.length) {
    metadata.openGraph.images = property.gallery
      .slice(0, 3)
      .map((photo) => ({ url: photo.src }));
  }
  return metadata;
}

export default async function PropertyDetailPage({
  params
}: PropertyDetailPageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  const { slug } = await params;
  setRequestLocale(locale);

  const property = getPublishedPropertyBySlug(slug);
  if (!property) notFound();

  const t = await getTranslations({ locale, namespace: 'property' });
  const tPage = await getTranslations({ locale, namespace: 'propertyPage' });

  const statusChip =
    property.transactionType === 'sale'
      ? 'chip bg-primary/10 text-primary'
      : 'chip bg-accent/10 text-accent-dark';
  const isOccupied = property.availability === 'occupied';

  const waText = encodeURIComponent(
    `${t('waPrefill')} "${property.title[locale]}"${
      property.price ? ` (${property.price.label[locale]})` : ''
    }. ${t('waSuffix')}`
  );

  const numericSpecs = [
    {
      icon: Ruler,
      label: t('specBuildingArea'),
      value:
        property.buildingAreaSqm !== undefined
          ? formatArea(property.buildingAreaSqm, locale)
          : undefined
    },
    {
      icon: Maximize,
      label: t('specLandArea'),
      value:
        property.landAreaSqm !== undefined
          ? formatArea(property.landAreaSqm, locale)
          : undefined
    },
    {
      icon: BedDouble,
      label: t('specBedrooms'),
      value: property.bedrooms !== undefined ? String(property.bedrooms) : undefined
    },
    {
      icon: Bath,
      label: t('specBathrooms'),
      value:
        property.bathrooms !== undefined ? String(property.bathrooms) : undefined
    }
  ].filter((spec): spec is { icon: typeof Ruler; label: string; value: string } =>
    Boolean(spec.value)
  );

  const breadcrumb = breadcrumbSchema([
    { name: 'Asharu', url: `${env.siteUrl}${localizedPathname('/', locale)}` },
    {
      name: tPage('backToList'),
      url: `${env.siteUrl}${localizedPathname('/properties', locale)}`
    },
    {
      name: property.title[locale],
      url: `${env.siteUrl}${localizedPathname('/properties/[slug]', locale, { slug })}`
    }
  ]);

  return (
    <article className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <ViewPropertyTracker itemId={property.slug} />

      <Link
        href="/properties"
        className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-dark"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {tPage('backToList')}
      </Link>

      {/* Hero */}
      <header className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={statusChip}>
            {property.transactionType === 'sale' ? t('sale') : t('rent')}
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {property.location[locale]}
          </span>
          {isOccupied ? (
            <span className="chip bg-danger/10 text-danger">
              <Info className="size-3" aria-hidden />
              {t('occupiedBadge')}
            </span>
          ) : null}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:text-4xl">
          {property.title[locale]}
        </h1>

        <p className="max-w-3xl leading-relaxed text-ink-muted">
          {property.description[locale]}
        </p>

        {property.addressFull ? (
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{t('addressLabel')}:</span>{' '}
            {property.addressFull[locale]}
          </p>
        ) : null}

        {property.price ? (
          <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
            <p className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
              {property.price.label[locale]}
            </p>
            {property.price.note ? (
              <p className="mt-1 text-sm text-ink-muted">{property.price.note[locale]}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-lg font-semibold text-primary">{t('contactForPrice')}</p>
        )}
      </header>

      {/* Contact CTAs */}
      <div className="mt-6 flex flex-wrap gap-3">
        {(property.contacts ?? []).map((contact) => (
          <TrackedExternalLink
            key={contact.international}
            href={`https://wa.me/${contact.international}?text=${waText}`}
            event="click_property_contact"
            params={{ item_id: property.slug, link_position: 'property-detail' }}
            aria-label={`${t('whatsappCta')} ${contact.display}`}
            className="btn-primary"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp {contact.display}
          </TrackedExternalLink>
        ))}
        {!property.contacts?.length && contactConfig.whatsappUrl ? (
          <TrackedExternalLink
            href={contactConfig.whatsappUrl}
            event="click_property_contact"
            params={{ item_id: property.slug, link_position: 'property-detail' }}
            className="btn-primary"
          >
            <MessageCircle className="size-4" aria-hidden />
            {t('whatsappCta')}
          </TrackedExternalLink>
        ) : null}
        {property.mapsUrl ? (
          <ExternalLink
            href={property.mapsUrl}
            aria-label={t('mapsCta')}
            className="btn-secondary"
          >
            <ExternalLinkIcon className="size-4" aria-hidden />
            Google Maps
          </ExternalLink>
        ) : null}
        {!property.contacts?.length && contactConfig.email ? (
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

      {isOccupied ? (
        <p className="mt-4 inline-flex items-start gap-2 rounded-lg border border-line bg-background p-3 text-sm text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          {t('occupiedNote')}
        </p>
      ) : null}

      {/* Gallery */}
      {property.gallery?.length ? (
        <section aria-labelledby="gallery-heading" className="mt-10">
          <h2
            id="gallery-heading"
            className="mb-4 text-xl font-semibold text-ink"
          >
            {t('galleryHeading')}
          </h2>
          <PropertyGallery photos={property.gallery} />
          {property.disclaimers?.gallery ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs italic text-ink-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {property.disclaimers.gallery[locale]}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Specifications */}
      {(numericSpecs.length > 0 || property.extraSpecs?.length) ? (
        <section aria-labelledby="specs-heading" className="mt-10">
          <h2 id="specs-heading" className="text-xl font-semibold text-ink">
            {tPage('specsHeading')}
          </h2>
          {numericSpecs.length > 0 ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {numericSpecs.map((spec) => (
                <div
                  key={spec.label}
                  className="rounded-lg border border-line bg-surface p-3"
                >
                  <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-muted">
                    <spec.icon className="size-3.5" aria-hidden />
                    {spec.label}
                  </dt>
                  <dd className="mt-1 text-base font-semibold text-ink">{spec.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {property.extraSpecs?.length ? (
            <dl className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
              {property.extraSpecs.map((spec) => (
                <div
                  key={spec.label.en + spec.value.en}
                  className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-3 px-4 py-3"
                >
                  <dt className="text-sm font-medium text-ink-muted">
                    {spec.label[locale]}
                  </dt>
                  <dd className="text-sm text-ink">{spec.value[locale]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}

      {/* Highlights */}
      {property.highlights?.length ? (
        <section aria-labelledby="highlights-heading" className="mt-10">
          <h2 id="highlights-heading" className="text-xl font-semibold text-ink">
            {t('highlightsHeading')}
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {property.highlights.map((highlight) => (
              <li
                key={highlight.title.en}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <h3 className="text-base font-semibold text-primary">
                  {highlight.title[locale]}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {highlight.body[locale]}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Facilities */}
      {property.facilities?.length ? (
        <section aria-labelledby="facilities-heading" className="mt-10">
          <h2 id="facilities-heading" className="text-xl font-semibold text-ink">
            {t('facilitiesHeading')}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {property.facilities.map((facility) => (
              <li key={facility.en} className="chip border border-line bg-surface text-ink">
                {facility[locale]}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Nearby places */}
      {property.nearbyPlaces?.length ? (
        <section aria-labelledby="nearby-heading" className="mt-10">
          <h2 id="nearby-heading" className="text-xl font-semibold text-ink">
            {t('nearbyHeading')}
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {property.nearbyPlaces.map((place) => (
              <li
                key={place.name.en}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm"
              >
                <span className="text-ink">{place.name[locale]}</span>
                {place.travelTime ? (
                  <span className="shrink-0 chip bg-primary/10 text-primary">
                    {place.travelTime[locale]}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs italic text-ink-muted">
            *{t('nearbyDisclaimer')}
          </p>
        </section>
      ) : null}

      {/* Video tour */}
      {property.video ? (
        <section aria-labelledby="video-heading" className="mt-10">
          <h2 id="video-heading" className="text-xl font-semibold text-ink">
            {t('videoHeading')}
          </h2>
          <video
            controls
            preload="metadata"
            poster={property.video.poster}
            className="mx-auto mt-4 max-h-[70vh] w-full max-w-md rounded-xl border border-line bg-black"
          >
            <source src={property.video.src} type="video/mp4" />
            {property.video.title[locale]}
          </video>
        </section>
      ) : null}

      {/* FAQ */}
      {property.faq?.length ? (
        <section aria-labelledby="faq-heading" className="mt-10">
          <h2 id="faq-heading" className="text-xl font-semibold text-ink">
            {t('faqHeading')}
          </h2>
          <div className="mt-4 space-y-2">
            {property.faq.map((item) => (
              <details
                key={item.question.en}
                className="group rounded-xl border border-line bg-surface p-4 open:bg-background"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.question[locale]}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {item.answer[locale]}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {/* Page disclaimer */}
      {property.disclaimers?.page ? (
        <p className="mt-10 rounded-xl border border-line bg-background p-4 text-xs leading-relaxed text-ink-muted">
          {property.disclaimers.page[locale]}
        </p>
      ) : null}

      <JsonLd data={realEstateListingSchema(property, locale)} />
      {property.faq?.length ? (
        <JsonLd data={faqSchema(property.faq, locale)} />
      ) : null}
      <JsonLd data={breadcrumb} />
    </article>
  );
}
