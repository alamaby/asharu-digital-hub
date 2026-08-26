'use client';

import { BedDouble, Bath, Info, KeyRound, MapPin, Maximize, Ruler, Tag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { Property } from '@/data/schemas';
import { Link } from '@/i18n/navigation';
import { contactConfig } from '@/config/site';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { formatArea } from '@/lib/utils/format';

interface PropertyCardProps {
  property: Property;
  linkPosition: string;
}

export function PropertyCard({ property, linkPosition }: PropertyCardProps) {
  const t = useTranslations('property');
  const locale = useLocale() as Locale;
  const primaryContact = property.contacts?.[0];

  const waHref = primaryContact
    ? `https://wa.me/${primaryContact.international}?text=${encodeURIComponent(
        `${t('waPrefill')} "${property.title[locale]}"${
          property.price ? ` (${property.price.label[locale]})` : ''
        }. ${t('waSuffix')}`
      )}`
    : contactConfig.whatsappUrl;

  const specs: Array<{ key: string; value: string; srLabel: string; Icon: typeof Ruler }> = [];
  if (property.buildingAreaSqm !== undefined) {
    specs.push({
      key: 'building',
      value: formatArea(property.buildingAreaSqm, locale),
      srLabel: t('buildingAreaSrOnly'),
      Icon: Ruler
    });
  }
  if (property.landAreaSqm !== undefined) {
    specs.push({
      key: 'land',
      value: formatArea(property.landAreaSqm, locale),
      srLabel: t('landAreaSrOnly'),
      Icon: Maximize
    });
  }
  if (property.bedrooms !== undefined) {
    specs.push({
      key: 'beds',
      value: String(property.bedrooms),
      srLabel: t('bedroomsSrOnly'),
      Icon: BedDouble
    });
  }
  if (property.bathrooms !== undefined) {
    specs.push({
      key: 'baths',
      value: String(property.bathrooms),
      srLabel: t('bathroomsSrOnly'),
      Icon: Bath
    });
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-primary">
      <div className="relative aspect-[3/2] bg-background">
        <ResponsiveImage
          src={property.image}
          alt={property.title[locale]}
          width={1200}
          height={800}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              property.transactionType === 'sale'
                ? 'chip bg-primary/10 text-primary'
                : 'chip bg-accent/10 text-accent-dark'
            }
          >
            {property.transactionType === 'sale' ? (
              <Tag className="size-3" aria-hidden />
            ) : (
              <KeyRound className="size-3" aria-hidden />
            )}
            {property.transactionType === 'sale' ? t('sale') : t('rent')}
          </span>
          {property.availability === 'occupied' ? (
            <span className="chip bg-danger/10 text-danger">
              <Info className="size-3" aria-hidden />
              {t('occupiedBadge')}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {property.location[locale]}
          </span>
        </div>

        <h3 className="text-base font-semibold leading-snug text-ink">
          {property.title[locale]}
        </h3>

        {property.price ? (
          <p className="text-sm">
            <span className="font-semibold text-primary">
              {property.price.label[locale]}
            </span>
            {property.price.note ? (
              <span className="block text-xs text-ink-muted">
                {property.price.note[locale]}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm font-semibold text-primary">{t('contactForPrice')}</p>
        )}

        {specs.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {specs.map(({ key, value, srLabel, Icon }) => (
              <li key={key} className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <strong className="font-semibold text-ink">{value}</strong>
                <span className="sr-only">{srLabel}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-sm text-ink-muted">{property.description[locale]}</p>

        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href={{ pathname: '/properties/[slug]', params: { slug: property.slug } }}
            className="btn-secondary"
          >
            {t('detailCta')}
          </Link>
          {waHref ? (
            <TrackedExternalLink
              href={waHref}
              event="click_property_contact"
              params={{ item_id: property.slug, link_position: linkPosition }}
              aria-label={`${t('whatsappCta')}${
                primaryContact ? ` ${primaryContact.display}` : ''
              }`}
              className="btn-primary"
            >
              {t('whatsappCta')}
            </TrackedExternalLink>
          ) : null}
        </div>
      </div>
    </article>
  );
}
