import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema } from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { pageHeading } from '@/lib/utils/title';
import { getPublishedArticles } from '@/lib/articles/public';
import { ArticleGrid } from '@/components/articles/ArticleGrid';
import { JsonLd } from '@/components/ui/JsonLd';

interface ArticlesPageProps {
  params: Promise<{ locale: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: ArticlesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.artikel' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/artikel',
    title: t('title'),
    description: t('description')
  });
}

export default async function ArticlesPage({ params }: ArticlesPageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const tMeta = await getTranslations({ locale, namespace: 'meta.artikel' });
  const t = await getTranslations({ locale, namespace: 'articles' });
  const catT = await getTranslations({ locale, namespace: 'categories' });
  // Build i18n-safe category label map from same keys that DB validation accepts.
  const categoryLabels: Record<string, string> = {};
  for (const k of ['automotive', 'electronics', 'home-living', 'fashion', 'sports-hobby', 'others'] as const) {
    try { categoryLabels[k] = catT(k); } catch { categoryLabels[k] = k; }
  }
  // Up limit to 100 to support client-side search/filter within ISR budget.
  const articles = await getPublishedArticles(locale, 100);

  const breadcrumb = breadcrumbSchema([
    { name: 'Asharu', url: `${env.siteUrl}${localizedPathname('/', locale)}` },
    {
      name: pageHeading(tMeta('title')),
      url: `${env.siteUrl}${localizedPathname('/artikel', locale)}`
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

      {articles.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ArticleGrid
          articles={articles}
          locale={locale}
          readMoreLabel={t('readMore')}
          affiliateBadgeLabel={t('affiliateBadge')}
          readingMinutesLabel={(n) => t('readingMinutes', { n })}
          searchPlaceholder={t('searchPlaceholder')}
          sortNewest={t('sortNewest')}
          sortOldest={t('sortOldest')}
          filterAll={t('filterAll')}
          filterAffiliateOnly={t('filterAffiliateOnly')}
          loadMore={t('loadMore')}
          emptyFiltered={t('emptyFiltered')}
          showingCount={(shown, total) => t('showingCount', { shown, total })}
          categoryLabels={categoryLabels}
        />
      )}

      <JsonLd data={breadcrumb} />
    </div>
  );
}
