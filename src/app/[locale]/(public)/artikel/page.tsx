import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema } from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { pageHeading } from '@/lib/utils/title';
import { getPublishedArticles } from '@/lib/articles/public';
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
  const articles = await getPublishedArticles(locale);

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
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-primary">
              <Link href={{ pathname: '/artikel/[slug]', params: { slug: a.slug } }} className="block">
                <h2 className="text-lg font-semibold leading-snug text-ink hover:text-primary">
                  {a.title}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">
                  {a.excerpt}
                </p>
                <span className="mt-3 inline-block text-sm font-medium text-primary">
                  {t('readMore')} →
                </span>
              </Link>
              {a.published_at ? (
                <p className="mt-2 text-xs text-ink-muted">
                  {new Date(a.published_at).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <JsonLd data={breadcrumb} />
    </div>
  );
}
