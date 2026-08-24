import { ArrowUpRight, Store } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { AffiliateProduct } from '@/data/schemas';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';

interface ProductCardProps {
  product: AffiliateProduct;
  linkPosition: string;
}

export function ProductCard({ product, linkPosition }: ProductCardProps) {
  const t = useTranslations('product');
  const tCategory = useTranslations('categories');
  const tA11y = useTranslations('a11y');
  const locale = useLocale() as Locale;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-primary">
      <div className="relative aspect-[4/3] bg-background">
        <ResponsiveImage
          src={product.image}
          alt={product.name[locale]}
          width={800}
          height={600}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="chip bg-primary/10 text-primary">
            {tCategory(product.category)}
          </span>
          <span className="chip bg-accent/10 text-accent-dark">
            {t('badge')}
          </span>
        </div>

        <h3 className="text-base font-semibold leading-snug text-ink">
          {product.name[locale]}
        </h3>
        <p className="text-sm text-ink-muted">{product.description[locale]}</p>

        <p className="text-sm font-semibold text-primary">{t('checkPrice')}</p>
        <p className="text-xs text-ink-muted">{t('priceNote')}</p>

        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <Store className="size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">{t('merchantSrOnly')}</span>
            {product.merchant}
          </span>
        </p>

        <div className="mt-auto pt-3">
          <TrackedExternalLink
            href={product.url}
            event="click_affiliate_product"
            params={{
              item_id: product.id,
              item_category: product.category,
              link_position: linkPosition
            }}
            rel="sponsored nofollow"
            className="btn-primary w-full"
          >
            {t('cta')}
            <ArrowUpRight className="size-4" aria-hidden />
            <span className="sr-only">{tA11y('newTab')}</span>
          </TrackedExternalLink>
        </div>
      </div>
    </article>
  );
}
