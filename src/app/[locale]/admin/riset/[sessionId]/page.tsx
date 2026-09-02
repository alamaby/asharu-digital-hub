import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { ResearchSessionActions } from '@/components/admin/ResearchSessionActions';
import { RetrySessionButton } from '@/components/admin/RetrySessionButton';
import { ResumeSessionButton } from '@/components/admin/ResumeSessionButton';
import { ResearchStepper } from '@/components/admin/ResearchStepper';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { formatDateTime, formatDateTimeSeconds } from '@/lib/utils/format';
import { previewAffiliateMatches } from '@/lib/research/affiliate';

interface PageProps {
  params: Promise<{ locale: string; sessionId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.research' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/riset/[sessionId]',
    title: t('detailTitle'),
    description: t('detailIntro'),
    robots: { index: false, follow: false }
  });
}

type TopicRow = {
  id: string;
  rank: number | null;
  topic: string;
  category: string | null;
  final_score: number | null;
  verification_status: string;
  status: string;
  unique_angle: string | null;
  key_facts: string[] | null;
  hooks: Array<{ type: string; text: string }> | null;
};

type DraftRow = {
  id: string;
  research_topic_id: string | null;
  generated_thread: { main: { id: string; en: string } };
  affiliate_injections: Array<{ id: string; friendly_code: string; post_index: number }>;
  affiliate_match_score: number | null;
  status: string;
};

export default async function ResearchSessionPage({ params }: PageProps) {
  const { locale: rawLocale, sessionId } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  const supabase = await createSupabaseServer();
  const t = await getTranslations({ locale, namespace: 'admin.research' });
  const timeZone = await getDisplayTimezone();

  if (!supabase) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-muted">Service unavailable</div>;
  }

  const { data: session } = await supabase
    .from('content_research_sessions')
    .select('id, status, target_location, secondary_location, platform_slug, audience_age, audience_interests, account_goal, tone, allowed_categories, excluded_categories, freshness_hours, minimum_candidates, minimum_score, required_winners, maximum_iterations, target_reply_count, error_message, created_at, current_stage_started_at, updated_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-ink-muted">{t('notFound')}</p>
      </div>
    );
  }

  const s = session as {
    id: string;
    status: string;
    target_location: string | null;
    secondary_location: string | null;
    platform_slug: string | null;
    audience_age: string | null;
    audience_interests: string[] | null;
    account_goal: string | null;
    tone: string | null;
    allowed_categories: string[] | null;
    excluded_categories: string[] | null;
    freshness_hours: number | null;
    minimum_candidates: number | null;
    minimum_score: number | null;
    required_winners: number | null;
    maximum_iterations: number | null;
    target_reply_count: number | null;
    error_message: string | null;
    created_at: string;
    current_stage_started_at: string | null;
    updated_at: string | null;
  };

  const { data: topics } = await supabase
    .from('content_research_topics')
    .select('id, rank, topic, category, final_score, verification_status, status, unique_angle, key_facts, hooks')
    .eq('session_id', sessionId)
    .order('rank', { ascending: true });

  // Query drafts by both request_id (legacy research path = sessionId) and research_topic_id
  const topicIds = ((topics ?? []) as TopicRow[]).map((t) => t.id);
  let draftList: DraftRow[] = [];
  if (topicIds.length > 0) {
    const { data: byTopic } = await supabase
      .from('content_drafts')
      .select('id, research_topic_id, generated_thread, affiliate_injections, affiliate_match_score, status')
      .in('research_topic_id', topicIds);
    const { data: byRequest } = await supabase
      .from('content_drafts')
      .select('id, research_topic_id, generated_thread, affiliate_injections, affiliate_match_score, status')
      .eq('request_id', sessionId);
    const merged = new Map<string, DraftRow>();
    for (const d of [...((byTopic ?? []) as DraftRow[]), ...((byRequest ?? []) as DraftRow[])]) merged.set(d.id, d);
    draftList = [...merged.values()];
  } else {
    const { data: drafts } = await supabase
      .from('content_drafts')
      .select('id, research_topic_id, generated_thread, affiliate_injections, affiliate_match_score, status')
      .eq('request_id', sessionId);
    draftList = (drafts ?? []) as DraftRow[];
  }

  const list = (topics ?? []) as TopicRow[];

  // At awaiting_selection, preview affiliate match per topic so the admin
  // sees which topics will generate a draft without an affiliate (pool
  // mismatch) before shortlisting — and can add a relevant product or pick a
  // more matchable topic.
  let affiliatePreviews: Map<string, { matched: boolean; bestScore: number; band: 'high' | 'medium' | 'low' | 'none' }> | null = null;
  if (s.status === 'awaiting_selection' && draftList.length === 0 && list.length > 0) {
    try {
      affiliatePreviews = await previewAffiliateMatches(supabase, list.map((tp) => ({
        id: tp.id,
        topic: tp.topic,
        category: tp.category,
        unique_angle: tp.unique_angle,
        key_facts: Array.isArray(tp.key_facts) ? tp.key_facts : undefined,
        hooks: Array.isArray(tp.hooks) ? tp.hooks : undefined
      })));
    } catch {
      affiliatePreviews = null;
    }
  }

  const { data: logs } = await supabase
    .from('content_research_logs')
    .select('id, stage, level, message, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm">
        <Link
          href={{ pathname: '/admin/riset' }}
          className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-primary"
        >
          <span aria-hidden>←</span>
          {t('backToList')}
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {s.target_location ?? (s.platform_slug && s.platform_slug !== 'all' ? s.platform_slug : t('platformAll')) ?? t('sessionLabel', { id: s.id.slice(0, 8) })}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {t('statusLabel')}: <span className="font-semibold">{s.status}</span> · {t('platformLabel')}: {s.platform_slug && s.platform_slug !== 'all' ? s.platform_slug : t('platformAll')} · {t('createdLabel')}: {formatDateTime(s.created_at, locale, timeZone)}
        </p>
        {s.error_message ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {t('errorLabel')}: {s.error_message}
          </p>
        ) : null}
      </header>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink">{t('paramsHeading')}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('toneLabel')}:</dt>
            <dd className="text-ink">{s.tone ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('audienceAgeLabel')}:</dt>
            <dd className="text-ink">{s.audience_age ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('audienceInterestsLabel')}:</dt>
            <dd className="text-ink">{s.audience_interests && s.audience_interests.length > 0 ? s.audience_interests.join(', ') : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('secondaryLocationLabel')}:</dt>
            <dd className="text-ink">{s.secondary_location ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('accountGoalLabel')}:</dt>
            <dd className="text-ink">{s.account_goal ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('allowedCategoriesLabel')}:</dt>
            <dd className="text-ink">{s.allowed_categories && s.allowed_categories.length > 0 ? s.allowed_categories.join(', ') : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('excludedCategoriesLabel')}:</dt>
            <dd className="text-ink">{s.excluded_categories && s.excluded_categories.length > 0 ? s.excluded_categories.join(', ') : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('freshnessHoursLabel')}:</dt>
            <dd className="text-ink">{s.freshness_hours ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('minimumCandidatesLabel')}:</dt>
            <dd className="text-ink">{s.minimum_candidates ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('minimumScoreLabel')}:</dt>
            <dd className="text-ink">{s.minimum_score ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('requiredWinnersLabel')}:</dt>
            <dd className="text-ink">{s.required_winners ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('maximumIterationsLabel')}:</dt>
            <dd className="text-ink">{s.maximum_iterations ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-ink-muted">{t('targetReplyCountLabel')}:</dt>
            <dd className="text-ink">{s.target_reply_count ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <ResearchStepper
        status={s.status}
        currentStageStartedAt={s.current_stage_started_at}
        createdAt={s.created_at}
        logs={(logs ?? []) as Array<{ stage: string; level: string; created_at: string }>}
        locale={locale}
        timeZone={timeZone}
        t={(key, params) => {
          try {
            // next-intl t supports params as second arg
            return (t as unknown as (k: string, p?: Record<string, string | number>) => string)(key, params);
          } catch {
            return key;
          }
        }}
      />

      {s.status === 'failed' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ResumeSessionButton sessionId={sessionId} />
          <RetrySessionButton sessionId={sessionId} />
        </div>
      ) : (s.status === 'completed' || s.status === 'awaiting_selection') ? (
        <RetrySessionButton sessionId={sessionId} />
      ) : null}

      {s.status === 'awaiting_selection' && draftList.length === 0 ? (
        <ResearchSessionActions
          sessionId={sessionId}
          topics={list.map((t) => ({
            id: t.id,
            rank: t.rank,
            topic: t.topic,
            category: t.category,
            final_score: t.final_score,
            verification_status: t.verification_status,
            status: t.status
          }))}
          affiliatePreviews={affiliatePreviews ? Object.fromEntries(affiliatePreviews) : null}
        />
      ) : draftList.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold text-ink">{t('draftsHeading')}</h2>
          {draftList.map((d) => {
            const injection = d.affiliate_injections[0];
            return (
              <Link
                key={d.id}
                href={{ pathname: '/konten/review' }}
                className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
              >
                <p className="text-sm font-medium text-ink">
                  {d.generated_thread.main.id.slice(0, 120)}…
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {t('productLabel')}: {injection?.friendly_code ?? '-'} · match {d.affiliate_match_score ?? '-'} · status {d.status}
                </p>
              </Link>
            );
          })}
        </section>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="text-sm text-ink-muted">
            {s.status === 'completed' ? t('draftsEmptyForCompleted') : t('noDrafts')}
          </p>
          <p className="mt-2 text-xs text-ink-muted">{t('noDraftsHint')}</p>
          {s.status === 'completed' ? (
            <p className="mt-2 text-xs">
              <Link href={{ pathname: '/konten/review' }} className="text-primary hover:underline">
                Lihat Review →
              </Link>
            </p>
          ) : null}
        </div>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-ink">{t('topicsHeading')}</h2>
        {list.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('noTopics')}</p>
        ) : (
          <ol className="space-y-2">
            {list.map((tp) => (
              <li key={tp.id}>
                <Link
                  href={{
                    pathname: '/admin/riset/[sessionId]/topics/[topicId]',
                    params: { sessionId, topicId: tp.id }
                  }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 shadow-card transition-colors hover:border-primary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      #{tp.rank ?? '-'} · {tp.topic}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {tp.category ?? '-'} · verify: {tp.verification_status} · status: {tp.status}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink">
                    {tp.final_score !== null ? tp.final_score.toFixed(1) : '-'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-ink">{t('logsHeading')}</h2>
        {!logs || logs.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('logsEmpty')}</p>
        ) : (
          <ol className="space-y-2">
            {(logs as Array<{ id: string; stage: string; level: string; message: string; created_at: string }>).map((lg) => (
              <li
                key={lg.id}
                className={`rounded-xl border p-3 text-xs ${lg.level === 'error' ? 'border-red-200 bg-red-50 text-red-800' : lg.level === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-line bg-surface text-ink-muted'}`}
              >
                <p className="font-medium">
                  [{lg.stage}] {lg.level} · {formatDateTimeSeconds(lg.created_at, locale, timeZone)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs">{lg.message.slice(0, 600)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
