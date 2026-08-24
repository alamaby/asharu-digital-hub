import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, productListSchema } from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { pageHeading } from '@/lib/utils/title';
import { affiliateProducts } from '@/data/affiliate-products';
import { AffiliateDisclosure } from '@/components/home/AffiliateDisclosure';
import { ProductCard } from '@/components/cards/ProductCard';
import { JsonLd } from '@/components/ui/JsonLd';

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ProductsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.products' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/products',
    title: t('title'),
    description: t('description')
  });
}

export default async function ProductsPage({ params }: ProductsPageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const tMeta = await getTranslations({ locale, namespace: 'meta.products' });

  const breadcrumb = breadcrumbSchema([
    { name: 'Asharu', url: `${env.siteUrl}${localizedPathname('/', locale)}` },
    {
      name: pageHeading(tMeta('title')),
      url: `${env.siteUrl}${localizedPathname('/products', locale)}`
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
        <AffiliateDisclosure id="products-disclosure" />
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {affiliateProducts.map((product) => (
          <li key={product.id} className="h-full">
            <ProductCard product={product} linkPosition="products-grid" />
          </li>
        ))}
      </ul>

      <JsonLd data={breadcrumb} />
      <JsonLd data={productListSchema(affiliateProducts, locale)} />
    </div>
  );
}
