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
import { ExternalLink } from '@/components/ui/ExternalLink';
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

/** Render markdown sederhana (## → h2, baris lain → paragraf). Tanpa HTML mentah. */
function MarkdownBody({ md }: { md: string }) {
  const blocks: { type: 'h2' | 'p'; text: string }[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join('\n').trim();
    if (text) blocks.push({ type: 'p', text });
    para = [];
  };
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (line.trim() === '') {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'h2' ? (
          <h2 key={i} className="mt-8 text-xl font-semibold text-ink">
            {b.text}
          </h2>
        ) : (
          <p key={i} className="mt-4 leading-relaxed text-ink">
            {b.text}
          </p>
        )
      )}
    </>
  );
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

      <header className="mt-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:text-4xl">
          {article.title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">{article.excerpt}</p>
        {article.published_at ? (
          <p className="mt-3 text-xs text-ink-muted">
            {t('publishedOn', {
              date: new Date(article.published_at).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })
            })}
          </p>
        ) : null}
      </header>

      {article.cover_image_url ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="mt-6">
        <MarkdownBody md={article.body_md} />
      </div>

      {article.affiliate_url ? (
        <aside className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            {product?.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={product.image}
                alt={product.name}
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-lg border border-line object-cover"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t('affiliateBoxTitle')}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {product ? t('affiliateBoxBody', { product: product.name }) : t('affiliateBoxBodyNoName')}
              </p>
            </div>
          </div>
          <ExternalLink
            href={product?.url ?? article.affiliate_url}
            className="btn-primary mt-3 inline-flex"
          >
            {t('affiliateBoxCta')}
          </ExternalLink>
          <p className="mt-2 text-xs italic text-ink-muted">{t('affiliateNote')}</p>
        </aside>
      ) : null}

      {article.faq.length > 0 ? (
        <section aria-labelledby="faq-heading" className="mt-10">
          <h2 id="faq-heading" className="text-xl font-semibold text-ink">
            {t('faqHeading')}
          </h2>
          <div className="mt-4 space-y-2">
            {article.faq.map((item, i) => (
              <details key={i} className="rounded-xl border border-line bg-surface p-4 open:bg-background">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-10 rounded-xl border border-line bg-background p-4 text-xs leading-relaxed text-ink-muted">
        {t('disclosureNote')}{' '}
        <Link href="/affiliate-disclosure" className="text-primary underline">
          {t('disclosureLink')}
        </Link>
      </p>

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
