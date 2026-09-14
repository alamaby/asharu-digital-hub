import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { articleFaqSchema, articleSchema, breadcrumbSchema } from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { getAllPublishedSlugs, getArticleProduct, getPublishedArticleBySlug } from '@/lib/articles/public';
import { ArticlePublicView } from '@/components/articles/ArticlePublicView';
import { JsonLd } from '@/components/ui/JsonLd';

interface ArticleDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs();
  return slugs.map((a) => ({ locale: a.locale, slug: a.slug }));
}

export async function generateMetadata({ params }: ArticleDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = await getPublishedArticleBySlug(locale as Locale, slug);
  if (!article) return {};
  const metadata = buildMetadata({
    locale: locale as Locale,
    path: '/artikel/[slug]',
    params: { slug },
    title: `${article.title} | Asharu`,
    description: article.excerpt.slice(0, 160)
  });
  if (metadata.openGraph && article.cover_image_url) {
    metadata.openGraph.images = [{ url: article.cover_image_url }];
  }
  return metadata;
}

export default async function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const article = await getPublishedArticleBySlug(locale, slug);
  if (!article) notFound();

  const t = await getTranslations({ locale, namespace: 'articles' });
  const product = await getArticleProduct(article.product_id);

  const breadcrumb = breadcrumbSchema([
    { name: 'Asharu', url: `${env.siteUrl}${localizedPathname('/', locale)}` },
    {
      name: t('breadcrumbList'),
      url: `${env.siteUrl}${localizedPathname('/artikel', locale)}`
    },
    {
      name: article.title,
      url: `${env.siteUrl}${localizedPathname('/artikel/[slug]', locale, { slug })}`
    }
  ]);

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/artikel" className="text-sm text-primary hover:underline">
        ← {t('backToList')}
      </Link>

      <ArticlePublicView
        title={article.title}
        excerpt={article.excerpt}
        dateLine={article.published_at ? t('publishedOn', {
          date: new Date(article.published_at).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        }) : null}
        coverUrl={article.cover_image_url}
        bodyMd={article.body_md}
        affiliate={article.affiliate_url ? {
          name: product?.name ?? null,
          url: product?.url ?? article.affiliate_url,
          image: product?.image ?? null
        } : null}
        affiliateTitle={t('affiliateBoxTitle')}
        affiliateBody={product ? t('affiliateBoxBody', { product: product.name }) : t('affiliateBoxBodyNoName')}
        affiliateCta={t('affiliateBoxCta')}
        affiliateNote={t('affiliateNote')}
        faqHeading={t('faqHeading')}
        faq={article.faq}
        disclosureNote={t('disclosureNote')}
        disclosureLinkLabel={t('disclosureLink')}
        disclosureHref={localizedPathname('/affiliate-disclosure', locale)}
      />

      <JsonLd
        data={articleSchema({
          title: article.title,
          description: article.excerpt.slice(0, 160),
          slug,
          locale,
          publishedAt: article.published_at,
          updatedAt: article.updated_at,
          image: article.cover_image_url
        })}
      />
      {article.faq.length > 0 ? <JsonLd data={articleFaqSchema(article.faq)} /> : null}
      <JsonLd data={breadcrumb} />
    </article>
  );
}
