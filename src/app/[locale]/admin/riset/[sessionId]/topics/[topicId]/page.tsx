import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string; sessionId: string; topicId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.research' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/riset/[sessionId]/topics/[topicId]',
    title: t('topicTitle'),
    description: t('detailIntro'),
    robots: { index: false, follow: false }
  });
}

interface HookItem {
  type: string;
  text: string;
}

interface SourceItem {
  title: string;
  publisher?: string;
  published_at?: string;
  url: string;
}

interface ScoreBreakdown {
  freshness?: number;
  local_relevance?: number;
  practical_value?: number;
  curiosity?: number;
  emotional_resonance?: number;
  credibility?: number;
  conversation_potential?: number;
  brand_relevance?: number;
  penalty?: number;
  final_score?: number;
}

export default async function TopicDetailPage({ params }: PageProps) {
  const { locale: rawLocale, sessionId, topicId } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  const supabase = createSupabaseService();
  const t = await getTranslations({ locale, namespace: 'admin.research' });

  if (!supabase) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-muted">Service unavailable</div>;
  }

  const { data: topic } = await supabase
    .from('content_research_topics')
    .select('id, rank, topic, category, why_now, audience_relevance, key_facts, unique_angle, hooks, recommended_format, recommended_platform, potential_risk, verification_status, sources, score_breakdown, final_score, status')
    .eq('id', topicId)
    .maybeSingle();

  if (!topic) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-ink-muted">{t('notFound')}</p>
      </div>
    );
  }

  const tp = topic as {
    id: string;
    rank: number | null;
    topic: string;
    category: string | null;
    why_now: string | null;
    audience_relevance: string | null;
    key_facts: unknown;
    unique_angle: string | null;
    hooks: unknown;
    recommended_format: string | null;
    recommended_platform: string[] | null;
    potential_risk: string | null;
    verification_status: string;
    sources: unknown;
    score_breakdown: ScoreBreakdown | null;
    final_score: number | null;
    status: string;
  };

  const hooks = Array.isArray(tp.hooks) ? (tp.hooks as HookItem[]) : [];
  const sources = Array.isArray(tp.sources) ? (tp.sources as SourceItem[]) : [];
  const facts = Array.isArray(tp.key_facts) ? (tp.key_facts as string[]) : [];
  const breakdown = tp.score_breakdown;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 space-y-6">
      <div className="text-sm">
        <Link
          href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId } }}
          className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-primary"
        >
          <span aria-hidden>←</span>
          {t('backToSession')}
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          #{tp.rank ?? '-'} · {tp.topic}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {tp.category ?? '-'} · {t('finalScore')}: <span className="font-semibold">{tp.final_score?.toFixed(1) ?? '-'}</span> · {tp.status} · verify: {tp.verification_status}
        </p>
      </header>

      {tp.why_now ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('whyNow')}</h2>
          <p className="mt-1 text-sm text-ink">{tp.why_now}</p>
        </section>
      ) : null}

      {tp.audience_relevance ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('audienceRelevance')}</h2>
          <p className="mt-1 text-sm text-ink">{tp.audience_relevance}</p>
        </section>
      ) : null}

      {tp.unique_angle ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('uniqueAngle')}</h2>
          <p className="mt-1 text-sm text-ink">{tp.unique_angle}</p>
        </section>
      ) : null}

      {facts.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('keyFacts')}</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink">
            {facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {hooks.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('hooks')}</h2>
          <ul className="mt-1 space-y-2">
            {hooks.map((h, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{h.type}</p>
                <p className="mt-1 text-ink">{h.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {breakdown ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('scoreBreakdown')}</h2>
          <dl className="mt-1 grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
            {Object.entries(breakdown).map(([k, v]) => (
              <div key={k} className="rounded border border-line bg-surface px-2 py-1">
                <dt className="text-xs text-ink-muted">{k}</dt>
                <dd className="font-mono">{v ?? '-'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {sources.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('sources')}</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {sources.map((s, i) => (
              <li key={i} className="break-words">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline"
                >
                  {s.title || s.url}
                </a>
                {s.publisher ? <span className="text-ink-muted"> — {s.publisher}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tp.potential_risk ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('potentialRisk')}</h2>
          <p className="mt-1 text-sm text-ink">{tp.potential_risk}</p>
        </section>
      ) : null}
    </div>
  );
}
