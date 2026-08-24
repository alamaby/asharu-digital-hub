import { ArrowUpRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { ShopLink } from '@/data/schemas';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { PlatformIcon } from '@/components/ui/PlatformIcon';

interface ShopCardProps {
  shop: ShopLink;
  linkPosition: string;
}

export function ShopCard({ shop, linkPosition }: ShopCardProps) {
  const t = useTranslations('shops');
  const tA11y = useTranslations('a11y');
  const locale = useLocale() as Locale;

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-primary">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PlatformIcon platform={shop.platform} className="size-5" />
        </span>
        <h3 className="text-base font-semibold leading-snug text-ink">{shop.name[locale]}</h3>
      </div>

      <p className="mt-3 flex-1 text-sm text-ink-muted">{shop.description[locale]}</p>

      <TrackedExternalLink
        href={shop.url}
        event="click_online_store"
        params={{ platform: shop.platform, link_position: linkPosition }}
        className="btn-secondary mt-4"
      >
        {t('cta')}
        <ArrowUpRight className="size-4" aria-hidden />
        <span className="sr-only">{tA11y('newTab')}</span>
      </TrackedExternalLink>
    </article>
  );
}
