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
import { affiliateProducts, getFeaturedProducts } from '@/data/affiliate-products';
import { getFeaturedProperties } from '@/data/properties';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { JsonLd } from '@/components/ui/JsonLd';
import { ShopCard } from '@/components/home/ShopCard';
import { SocialLinksGrid } from '@/components/home/SocialLinksGrid';
import { AffiliateDisclosure } from '@/components/home/AffiliateDisclosure';
import { ContactCTA } from '@/components/home/ContactCTA';
import { ProductCard } from '@/components/cards/ProductCard';
import { PropertyBrowser } from '@/components/cards/PropertyBrowser';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { mathAppConfig } from '@/data/math-app';

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

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

  const featuredProducts = getFeaturedProducts(6);
  const featuredProperties = getFeaturedProperties(6);

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
            <a href="#online-stores" className="btn-primary">
              {tHero('primaryCta')}
              <ArrowDown className="size-4" aria-hidden />
            </a>
            <Link href="/properties" className="btn-secondary">
              {tHero('secondaryCta')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* C. Online stores */}
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

        {/* D. Social media */}
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

        {/* E. Featured affiliate products */}
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
          <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <li key={product.id} className="h-full">
                <ProductCard product={product} linkPosition="home-featured" />
              </li>
            ))}
          </ul>
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

        {/* F. Properties for sale / rent */}
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

      <JsonLd data={productListSchema(affiliateProducts.filter((p) => p.featured), locale)} />
    </>
  );
}
