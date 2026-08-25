import { ArrowUpRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { ShopLink, ShopPlatform } from '@/data/schemas';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { cn } from '@/lib/utils/cn';

/** Brand-tinted icon chips (decorative — identity always carried by text). */
const PLATFORM_ACCENT: Partial<Record<ShopPlatform, string>> = {
  shopee: 'bg-[#EE4D2D] text-white'
};

interface ShopCardProps {
  shop: ShopLink;
  linkPosition: string;
}

export function ShopCard({ shop, linkPosition }: ShopCardProps) {
  const t = useTranslations('shops');
  const tA11y = useTranslations('a11y');
  const locale = useLocale() as Locale;

  const href = shop.affiliateUrl ?? shop.url;
  const usesAffiliateLink = Boolean(shop.affiliateUrl);

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-primary">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            PLATFORM_ACCENT[shop.platform] ?? 'bg-primary/10 text-primary'
          )}
        >
          <PlatformIcon platform={shop.platform} className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold leading-snug text-ink">
            {shop.name[locale]}
          </h3>
          {shop.handle ? (
            <p className="truncate text-xs text-ink-muted">{shop.handle}</p>
          ) : null}
        </div>
      </div>

      <p className="mt-3 flex-1 text-sm text-ink-muted">{shop.description[locale]}</p>

      <TrackedExternalLink
        href={href}
        event="click_online_store"
        params={{ platform: shop.platform, link_position: linkPosition }}
        rel={usesAffiliateLink ? 'sponsored nofollow' : undefined}
        className="btn-secondary mt-4"
      >
        {t('cta')}
        <span className="sr-only">{shop.name[locale]}</span>
        <ArrowUpRight className="size-4" aria-hidden />
        <span className="sr-only">{tA11y('newTab')}</span>
      </TrackedExternalLink>
    </article>
  );
}
