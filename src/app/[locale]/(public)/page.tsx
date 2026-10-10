import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowDown, ArrowRight, Calculator, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { productListSchema } from '@/lib/seo/jsonld';
import { getVisibleShopLinks } from '@/data/shop-links';
import { getSocialLinks } from '@/data/social-links';
import { getFeaturedProductsDB } from '@/lib/affiliate/public';
import { getFeaturedProperties } from '@/data/properties';
import { getPublishedArticles } from '@/lib/articles/public';
import type { ArticleLocale } from '@/lib/articles/types';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { JsonLd } from '@/components/ui/JsonLd';
import { ShopCard } from '@/components/home/ShopCard';
import { SocialLinksGrid } from '@/components/home/SocialLinksGrid';
import { AffiliateDisclosure } from '@/components/home/AffiliateDisclosure';
import { ContactCTA } from '@/components/home/ContactCTA';
import { GithubRepoLink } from '@/components/ui/GithubRepoLink';
import { ProductCarousel } from '@/components/cards/ProductCarousel';
import { PropertyBrowser } from '@/components/cards/PropertyBrowser';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { mathAppConfig } from '@/data/math-app';

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.home' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/',
    title: t('title'),
    description: t('description')
  });
}

export default async function HomePage({ params }: HomePageProps) {
  const rawLocale = (await params).locale;
  const locale = (hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const tHero = await getTranslations({ locale, namespace: 'hero' });
  const tHome = await getTranslations({ locale, namespace: 'home' });
  const tA11y = await getTranslations({ locale, namespace: 'a11y' });
  const tArticles = await getTranslations({ locale, namespace: 'articles' });

  const featuredProducts = await getFeaturedProductsDB(6);
  const featuredProperties = getFeaturedProperties(6);
  const latestArticles = await getPublishedArticles(locale as ArticleLocale, 3);

  return (
    <>
      {/* B. Hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            {tHero('tagline')}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            {tHero('title')}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
            {tHero('description')}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/digital-hub" className="btn-primary">
              {tHero('primaryCta')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href="#mesin-riset" className="btn-secondary">
              {tHero('secondaryCta')}
              <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* B0. Digital Hub promo */}
        <section
          id="digital-hub"
          aria-labelledby="digital-hub-promo-heading"
          className="scroll-mt-24 py-10"
        >
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <SectionHeading
              id="digital-hub-promo-heading"
              title={tHome('digitalHub.heading')}
              description={tHome('digitalHub.description')}
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/digital-hub"
                className="btn-primary"
              >
                {tHome('digitalHub.cta')}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <GithubRepoLink
                cta={tHome('digitalHub.repoCta')}
                newTabLabel={tA11y('newTab')}
              />
            </div>
          </div>
        </section>

        {/* Pipeline & Output section */}
        <section
          id="mesin-riset"
          aria-labelledby="mesin-riset-heading"
          className="scroll-mt-24 py-10"
        >
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <div className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {tHome('pipeline.label')}
            </div>
            <SectionHeading
              id="mesin-riset-heading"
              title={tHome('pipeline.heading')}
              description={tHome('pipeline.description')}
            />
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  { num: '01', key: 'pipeline.step1' },
                  { num: '02', key: 'pipeline.step2' },
                  { num: '03', key: 'pipeline.step3' },
                  { num: '04', key: 'pipeline.step4' },
                  { num: '05', key: 'pipeline.step5' },
                  { num: '06', key: 'pipeline.step6' }
                ] as const
              ).map(({ num, key }, index, steps) => (
                <li
                  key={num}
                  className="rounded-xl border border-line bg-surface/50 p-4"
                >
                  <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {num}
                  </span>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                    {tHome(key)}
                  </p>
                  {index < steps.length - 1 ? (
                    <span aria-hidden="true" className="mt-3 flex justify-center text-primary/50 lg:hidden">
                      <ArrowDown className="size-5" aria-hidden />
                    </span>
                  ) : null}
                  {index < steps.length - 1 ? (
                    <span aria-hidden="true" className="mt-3 hidden justify-end pr-1 text-primary/50 lg:flex">
                      <ArrowRight className="size-5" aria-hidden />
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          {latestArticles.length > 0 ? (
            <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <SectionHeading
                    id="output-articles-heading"
                    title={tHome('output.heading')}
                    description={tHome('output.description')}
                  />
                </div>
                <Link
                  href="/artikel"
                  className="btn-secondary min-h-touch inline-flex items-center text-sm"
                >
                  {tHome('output.viewAll')}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>

              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {latestArticles.map((article) => {
                  const href = { pathname: '/artikel/[slug]' as const, params: { slug: article.slug } };
                  const dateStr = article.published_at
                    ? new Date(article.published_at).toLocaleDateString(
                        locale === 'id' ? 'id-ID' : 'en-US',
                        { day: 'numeric', month: 'long', year: 'numeric' }
                      )
                    : null;
                  return (
                    <li
                      key={article.id}
                      className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-card transition hover:border-primary"
                    >
                      <div>
                        <h3 className="text-base font-semibold leading-snug text-ink">
                          <Link href={href as never} className="hover:text-primary">
                            {article.title}
                          </Link>
                        </h3>
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">
                          {article.excerpt}
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs text-ink-muted">
                        {dateStr ? <time>{dateStr}</time> : <span />}
                        <Link
                          href={href as never}
                          className="min-h-touch inline-flex items-center font-medium text-primary hover:underline"
                        >
                          {tArticles('readMore')} →
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>

        {/* C. Featured affiliate products */}
        <section
          id="affiliate-products"
          aria-labelledby="affiliate-products-heading"
          className="scroll-mt-24 py-10"
        >
          <SectionHeading
            id="affiliate-products-heading"
            title={tHome('products.heading')}
            description={tHome('products.description')}
          />
          <div className="mt-6">
            <AffiliateDisclosure id="home-affiliate-disclosure" />
          </div>
          <div className="mt-6">
            <ProductCarousel products={featuredProducts} linkPosition="home-featured" />
          </div>
          <div className="mt-6">
            <Link
              href="/products"
              className="inline-flex min-h-touch items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-dark"
            >
              {tHome('products.viewAll')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        {/* D. Properties for sale / rent */}
        <section
          id="properties"
          aria-labelledby="properties-heading"
          className="scroll-mt-24 py-10"
        >
          <SectionHeading
            id="properties-heading"
            title={tHome('properties.heading')}
            description={tHome('properties.description')}
          />
          <div className="mt-6">
            <PropertyBrowser properties={featuredProperties} linkPosition="home-properties" />
          </div>
          <div className="mt-6">
            <Link
              href="/properties"
              className="inline-flex min-h-touch items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-dark"
            >
              {tHome('properties.viewAll')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        {/* E. Online stores */}
        <section
          id="online-stores"
          aria-labelledby="online-stores-heading"
          className="scroll-mt-24 py-10"
        >
          <SectionHeading
            id="online-stores-heading"
            title={tHome('stores.heading')}
            description={tHome('stores.description')}
          />
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {getVisibleShopLinks().map((shop) => (
              <li key={shop.id} className="h-full">
                <ShopCard shop={shop} linkPosition="home-stores" />
              </li>
            ))}
          </ul>
        </section>

        {/* F. Social media */}
        <section
          id="social-media"
          aria-labelledby="social-media-heading"
          className="scroll-mt-24 py-10"
        >
          <SectionHeading
            id="social-media-heading"
            title={tHome('socials.heading')}
            description={tHome('socials.description')}
          />
          <div className="mt-6">
            <SocialLinksGrid links={getSocialLinks()} linkPosition="home-socials" />
          </div>
        </section>

        {/* G. Belajar Matematika */}
        <section
          id="belajar-math"
          aria-labelledby="belajar-math-heading"
          className="scroll-mt-24 py-10"
        >
          <SectionHeading
            id="belajar-math-heading"
            title={tHome('math.heading')}
            description={tHome('math.description')}
          />
          <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-accent/10 text-accent-dark">
                <Sparkles className="size-3" aria-hidden />
                {tHome('math.badge')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                <Calculator className="size-4" aria-hidden />
                math.asharu.id
              </span>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-ink">
              {mathAppConfig.title[locale]}
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted marker:text-primary">
              {mathAppConfig.bulletPoints.map((point) => (
                <li key={point.id}>{point[locale]}</li>
              ))}
            </ul>
            <div className="mt-5">
              <TrackedExternalLink
                href={mathAppConfig.url}
                event="click_math_app"
                params={{ platform: 'math-app', link_position: 'home-math' }}
                className="btn-primary"
              >
                {tHome('math.cta')}
                <ArrowRight className="size-4" aria-hidden />
              </TrackedExternalLink>
              <span className="sr-only">Asharu Math</span>
            </div>
          </div>
        </section>

        {/* H. About teaser */}
        <section aria-labelledby="about-teaser-heading" className="py-10">
          <SectionHeading id="about-teaser-heading" title={tHome('about.heading')} />
          <div className="mt-4 max-w-3xl space-y-3 text-base leading-relaxed text-ink-muted">
            <p>{tHome('about.p1')}</p>
            <p>{tHome('about.p2')}</p>
            <p>{tHome('about.p3')}</p>
          </div>
        </section>

        {/* H. Contact CTA */}
        <ContactCTA id="contact" linkPosition="home-contact" />
      </div>

      <JsonLd data={productListSchema(featuredProducts, locale)} />
    </>
  );
}
