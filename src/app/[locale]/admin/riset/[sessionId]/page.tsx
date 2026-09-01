import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { ResearchSessionActions } from '@/components/admin/ResearchSessionActions';

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

  const supabase = createSupabaseService();
  const t = await getTranslations({ locale, namespace: 'admin.research' });

  if (!supabase) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-muted">Service unavailable</div>;
  }

  const { data: session } = await supabase
    .from('content_research_sessions')
    .select('id, status, topic, platform_slug, audience_age, target_location, account_goal, error_message, created_at')
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
    topic: string;
    platform_slug: string | null;
    audience_age: string | null;
    target_location: string | null;
    account_goal: string | null;
    error_message: string | null;
    created_at: string;
  };

  const { data: topics } = await supabase
    .from('content_research_topics')
    .select('id, rank, topic, category, final_score, verification_status, status')
    .eq('session_id', sessionId)
    .order('rank', { ascending: true });

  const { data: drafts } = await supabase
    .from('content_drafts')
    .select('id, research_topic_id, generated_thread, affiliate_injections, affiliate_match_score, status')
    .eq('request_id', sessionId);

  const list = (topics ?? []) as TopicRow[];
  const draftList = (drafts ?? []) as DraftRow[];

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
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{s.topic}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {t('statusLabel')}: <span className="font-semibold">{s.status}</span> · {t('platformLabel')}: {s.platform_slug ?? '-'} · {t('createdLabel')}: {new Date(s.created_at).toISOString().slice(0, 16).replace('T', ' ')}
        </p>
        {s.error_message ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {t('errorLabel')}: {s.error_message}
          </p>
        ) : null}
      </header>

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
        <p className="mt-8 rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">
          {t('empty')}
        </p>
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
    </div>
  );
}
