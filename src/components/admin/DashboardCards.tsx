import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface RecentDraft {
  id: string;
  request_id: string;
  status: string;
  created_at: string;
  topic: string;
  generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  affiliate_injections: { friendly_code: string; post_index: number }[];
  llm_meta?: { provider: string; model: string };
}

interface DashboardCardsProps {
  pending: number;
  failed: number;
  needsReview: number;
  email: string;
  recentDrafts: RecentDraft[];
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'needs_review'
      ? 'bg-amber-50 text-amber-800'
      : status === 'approved'
        ? 'bg-emerald-50 text-emerald-800'
        : status === 'rejected'
          ? 'bg-red-50 text-red-800'
          : 'bg-surface text-ink-muted';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function shortTopic(topic: string, max = 80): string {
  if (topic.length <= max) return topic;
  return topic.slice(0, max - 1) + '…';
}

export function DashboardCards({ pending, failed, needsReview, email, recentDrafts }: DashboardCardsProps) {
  const t = useTranslations('admin.dashboard');

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('greeting', { email })}</p>
        </div>
        <span className="chip border border-primary/30 bg-primary/10 text-primary">{t('roleBadge')}</span>
      </header>

      <section aria-labelledby="queue-heading" className="space-y-3">
        <h2 id="queue-heading" className="text-lg font-semibold text-ink">{t('queueHeading')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href={{ pathname: '/admin/konten', query: { type: 'requests', status: 'pending' } }}
            className="rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('queuePending')}</p>
            <p className="mt-1 text-3xl font-bold text-ink">{pending}</p>
          </Link>
          <Link
            href={{ pathname: '/admin/konten', query: { type: 'requests', status: 'failed' } }}
            className="rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('queueFailed')}</p>
            <p className="mt-1 text-3xl font-bold text-ink">{failed}</p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="review-heading" className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 id="review-heading" className="text-lg font-semibold text-ink">{t('reviewHeading')}</h2>
          <Link
            href={{ pathname: '/admin/konten', query: { type: 'drafts', status: 'needs_review' } }}
            className="text-sm text-primary underline"
          >
            {t('actionsReview')}
          </Link>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-3xl font-bold text-ink">{needsReview}</p>
          {needsReview === 0 ? <p className="mt-1 text-sm text-ink-muted">{t('reviewEmpty')}</p> : null}
        </div>
      </section>

      <section aria-labelledby="research-heading" className="space-y-3">
        <h2 id="research-heading" className="text-lg font-semibold text-ink">{t('researchHeading')}</h2>
        <div className="rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-ink-muted shadow-card">
          <p className="font-medium text-ink">{t('researchSoon')}</p>
          <p className="mt-1">{t('researchHint')}</p>
        </div>
      </section>

      <RecentDraftsList drafts={recentDrafts} />

      <section aria-labelledby="actions-heading" className="space-y-3">
        <h2 id="actions-heading" className="text-lg font-semibold text-ink">{t('actionsHeading')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={{ pathname: '/konten/baru' }} className="btn-primary text-center">
            {t('actionsNew')}
          </Link>
          <Link
            href={{ pathname: '/admin/konten', query: { status: 'needs_review' } }}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-center text-sm font-medium text-ink transition-colors hover:border-primary"
          >
            {t('actionsReview')}
          </Link>
          <Link
            href={{ pathname: '/admin/konten' }}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-center text-sm font-medium text-ink transition-colors hover:border-primary"
          >
            {t('actionsList')}
          </Link>
          <button
            type="button"
            disabled
            title={t('actionsDiscoveryDisabledHint')}
            className="cursor-not-allowed rounded-lg border border-line bg-surface px-4 py-2 text-center text-sm font-medium text-ink-muted opacity-60"
          >
            {t('actionsDiscovery')}
          </button>
        </div>
      </section>
    </div>
  );
}

function RecentDraftsList({ drafts }: { drafts: RecentDraft[] }) {
  const t = useTranslations('admin.dashboard');
  return (
    <section aria-labelledby="recent-heading" className="space-y-3">
      <h2 id="recent-heading" className="text-lg font-semibold text-ink">{t('recentHeading')}</h2>
      {drafts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-ink-muted">
          {t('recentEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 shadow-card"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{shortTopic(d.topic)}</p>
                <p className="text-xs text-ink-muted">
                  {d.llm_meta?.provider ?? '—'} · {d.llm_meta?.model ?? '—'}
                </p>
              </div>
              <StatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
