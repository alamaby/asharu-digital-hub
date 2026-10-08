import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, CheckCircle2, FlaskConical } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  breadcrumbSchema,
  digitalHubSoftwareSchema,
  simpleFaqSchema
} from '@/lib/seo/jsonld';
import { localizedPathname } from '@/lib/seo/paths';
import { env } from '@/lib/env';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { JsonLd } from '@/components/ui/JsonLd';
import { GithubRepoLink } from '@/components/ui/GithubRepoLink';
import { WaitlistForm } from '@/components/digital-hub/WaitlistForm';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.digitalHub' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/digital-hub',
    title: t('title'),
    description: t('description')
  });
}

export default async function DigitalHubPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'digitalHub' });
  const tA11y = await getTranslations({ locale, namespace: 'a11y' });
  const pageUrl = `${env.siteUrl}${localizedPathname('/digital-hub', locale)}`;
  const homeUrl = `${env.siteUrl}${localizedPathname('/', locale)}`;

  const problems = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    title: t(`problem${n}Title`),
    body: t(`problem${n}Body`)
  }));
  const steps = [
    { title: t('stepResearchTitle'), body: t('stepResearchBody') },
    { title: t('stepComposeTitle'), body: t('stepComposeBody') },
    { title: t('stepReviewTitle'), body: t('stepReviewBody') },
    { title: t('stepPublishTitle'), body: t('stepPublishBody') },
    { title: t('stepPortfolioTitle'), body: t('stepPortfolioBody') }
  ];
  const outputs = [1, 2, 3, 4, 5].map((n) => t(`output${n}`));
  const users = [1, 2, 3, 4, 5, 6, 7].map((n) => t(`user${n}`));
  const aiPoints = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => t(`ai${n}`));
  const faqs = [1, 2, 3, 4].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav aria-label={locale === 'id' ? 'Navigasi breadcrumb' : 'Breadcrumb'} className="pt-6 text-sm text-ink-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="underline underline-offset-4 hover:text-primary">
                Asharu
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-ink">
              Digital Hub
            </li>
          </ol>
        </nav>

        {/* A. Hero */}
        <section aria-labelledby="digital-hub-heading" className="border-b border-line py-10 sm:py-14">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-primary">
            <FlaskConical className="size-3" aria-hidden />
            {t('heroTag')} · {t('statusBadge')}
          </p>
          <h1 id="digital-hub-heading" className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">{t('heroDesc')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#pilot" className="btn-primary">
              {t('primaryCta')}
              <ArrowRight className="size-4" aria-hidden />
            </a>
            <a href="#cara-kerja" className="btn-secondary">
              {t('secondaryCta')}
            </a>
            <GithubRepoLink cta={t('repoCta')} newTabLabel={tA11y('newTab')} />
          </div>
          <p className="mt-4 max-w-2xl text-sm text-ink-muted">{t('heroNote')}</p>
          <div className="mt-4 max-w-2xl rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">{t('statusTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('statusBody')}</p>
          </div>
        </section>

        {/* B. Problems */}
        <section aria-labelledby="dh-problems-heading" className="scroll-mt-24 py-10">
          <SectionHeading id="dh-problems-heading" title={t('problemsHeading')} description={t('problemsDesc')} />
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {problems.map((p) => (
              <li key={p.title} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <h3 className="text-base font-semibold text-ink">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* C. Workflow */}
        <section id="cara-kerja" aria-labelledby="dh-workflow-heading" className="scroll-mt-24 border-t border-line py-10">
          <SectionHeading id="dh-workflow-heading" title={t('workflowHeading')} description={t('workflowDesc')} />
          <ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-5">
            {steps.map((s) => (
              <li key={s.title} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <h3 className="text-base font-semibold text-primary">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* D. Differentiator */}
        <section aria-labelledby="dh-diff-heading" className="border-t border-line py-10">
          <SectionHeading id="dh-diff-heading" title={t('diffHeading')} description={t('diffDesc')} />
          <p className="mt-4 rounded-lg bg-background px-3 py-2 text-sm font-medium text-ink">
            {t('diffFlow')}
          </p>
          <div className="mt-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t('exampleLabel')}</p>
            <h3 className="mt-2 text-lg font-semibold text-ink">{t('exampleTitle')}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('exampleBody')}</p>
            <ul className="mt-3 space-y-1.5">
              {outputs.map((o) => (
                <li key={o} className="flex items-start gap-2 text-sm text-ink-muted">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* E. Target users */}
        <section aria-labelledby="dh-users-heading" className="border-t border-line py-10">
          <SectionHeading id="dh-users-heading" title={t('usersHeading')} description={t('usersDesc')} />
          <ul className="mt-6 flex flex-wrap gap-2">
            {users.map((u) => (
              <li key={u} className="chip rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink">
                {u}
              </li>
            ))}
          </ul>
        </section>

        {/* F. Responsible AI */}
        <section aria-labelledby="dh-ai-heading" className="border-t border-line py-10">
          <SectionHeading id="dh-ai-heading" title={t('aiHeading')} description={t('aiDesc')} />
          <ul className="mt-6 space-y-2.5">
            {aiPoints.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* G+H. Pilot waitlist */}
        <section id="pilot" aria-labelledby="dh-pilot-heading" className="scroll-mt-24 border-t border-line py-10">
          <SectionHeading id="dh-pilot-heading" title={t('pilotHeading')} description={t('pilotDesc')} />
          <div className="mt-6">
            <WaitlistForm />
          </div>
          <div className="mt-6 rounded-xl border border-line bg-surface p-4">
            <h3 className="text-base font-semibold text-ink">{t('existingHeading')}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('existingBody')}</p>
            <p className="mt-3">
              <GithubRepoLink
                cta={t('repoCta')}
                newTabLabel={tA11y('newTab')}
                variant="inline"
              />
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="dh-faq-heading" className="border-t border-line py-10">
          <SectionHeading id="dh-faq-heading" title={t('faqHeading')} />
          <dl className="mt-6 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-base font-semibold text-ink">{f.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6">
            <Link href="/" className="inline-flex min-h-touch items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-dark">
              {t('backHome')}
            </Link>
          </p>
        </section>
      </div>

      <JsonLd
        data={digitalHubSoftwareSchema(locale)}
      />
      <JsonLd data={simpleFaqSchema(faqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Asharu', url: homeUrl },
          { name: 'Digital Hub', url: pageUrl }
        ])}
      />
    </>
  );
}
