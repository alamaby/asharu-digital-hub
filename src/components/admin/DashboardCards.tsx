import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AdminBadge } from '@/components/admin/shell/AdminBadge';
import { AdminCard } from '@/components/admin/shell/AdminCard';
import { AdminPageHeader } from '@/components/admin/shell/AdminPageHeader';
import { AdminFunnelChart } from '@/components/admin/charts/AdminFunnelChart';
import { AdminTrendChart } from '@/components/admin/charts/AdminTrendChart';

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

export interface TrendDay {
  hari: string;
  draf: number;
  disetujui: number;
}

export interface FunnelRow {
  status: string;
  jumlah: number;
}

export interface LlmWeek {
  panggilan: number;
  sukses_pct: number | null;
  token_masuk: number;
  token_keluar: number;
}

interface DashboardCardsProps {
  pending: number;
  failed: number;
  needsReview: number;
  awaitingSelection: number;
  email: string;
  recentDrafts: RecentDraft[];
  trend: TrendDay[];
  funnel: FunnelRow[];
  llmWeek: LlmWeek;
}

function badgeColor(status: string): 'warning' | 'success' | 'error' | 'neutral' {
  if (status === 'needs_review') return 'warning';
  if (status === 'approved') return 'success';
  if (status === 'rejected' || status === 'failed') return 'error';
  return 'neutral';
}

function shortTopic(topic: string, max = 80): string {
  if (topic.length <= max) return topic;
  return topic.slice(0, max - 1) + '…';
}

function StatCard({
  label,
  value,
  href,
  query
}: {
  label: string;
  value: number;
  href: string;
  query?: Record<string, string>;
}) {
  return (
    <Link
      href={{ pathname: href as never, query }}
      className="rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand-400 dark:shadow-none"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
    </Link>
  );
}

export function DashboardCards({
  pending,
  failed,
  needsReview,
  awaitingSelection,
  email,
  recentDrafts,
  trend,
  funnel,
  llmWeek
}: DashboardCardsProps) {
  const t = useTranslations('admin.dashboard');

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t('title')}
        intro={t('greeting', { email })}
        badge={
          <span className="chip border border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400">
            {t('roleBadge')}
          </span>
        }
      />

      <section aria-labelledby="queue-heading" className="space-y-3">
        <h2 id="queue-heading" className="sr-only">
          {t('queueHeading')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('queuePending')}
            value={pending}
            href="/admin/konten"
            query={{ type: 'requests', status: 'pending' }}
          />
          <StatCard
            label={t('queueFailed')}
            value={failed}
            href="/admin/konten"
            query={{ type: 'requests', status: 'failed' }}
          />
          <StatCard
            label={t('reviewHeading')}
            value={needsReview}
            href="/admin/konten"
            query={{ type: 'drafts', status: 'needs_review' }}
          />
          <StatCard
            label={t('queueAwaiting')}
            value={awaitingSelection}
            href="/admin/riset"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <AdminCard title={t('trendHeading')} desc={t('trendDesc')} className="xl:col-span-3">
          {trend.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('recentEmpty')}</p>
          ) : (
            <AdminTrendChart
              days={trend}
              draftsLabel={t('trendDrafts')}
              approvedLabel={t('trendApproved')}
              chartLabel={t('trendHeading')}
            />
          )}
        </AdminCard>

        <AdminCard title={t('funnelHeading')} desc={t('funnelDesc')} className="xl:col-span-2">
          {funnel.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('recentEmpty')}</p>
          ) : (
            <AdminFunnelChart rows={funnel} chartLabel={t('funnelHeading')} />
          )}
        </AdminCard>
      </div>

      <AdminCard title={t('llmHeading')} desc={t('llmDesc')}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-background p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('llmCalls')}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{llmWeek.panggilan}</dd>
          </div>
          <div className="rounded-xl bg-background p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('llmSuccess')}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {llmWeek.sukses_pct === null ? '—' : `${llmWeek.sukses_pct}%`}
            </dd>
          </div>
          <div className="rounded-xl bg-background p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('llmTokens')}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {(llmWeek.token_masuk + llmWeek.token_keluar).toLocaleString()}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <RecentDraftsList drafts={recentDrafts} />

      <section aria-labelledby="actions-heading" className="space-y-3">
        <h2 id="actions-heading" className="text-lg font-semibold text-ink">{t('actionsHeading')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={{ pathname: '/konten/baru' }} className="btn-primary text-center">
            {t('actionsNew')}
          </Link>
          <Link
            href={{ pathname: '/admin/konten', query: { status: 'needs_review' } }}
            className="btn-secondary text-center"
          >
            {t('actionsReview')}
          </Link>
          <Link
            href={{ pathname: '/admin/konten' }}
            className="btn-secondary text-center"
          >
            {t('actionsList')}
          </Link>
          <Link
            href={{ pathname: '/admin/riset' }}
            className="btn-secondary text-center"
          >
            {t('actionsDiscovery')}
          </Link>
        </div>
      </section>
    </div>
  );
}

function RecentDraftsList({ drafts }: { drafts: RecentDraft[] }) {
  const t = useTranslations('admin.dashboard');
  return (
    <AdminCard
      title={t('recentHeading')}
      action={
        <Link
          href={{ pathname: '/admin/konten', query: { type: 'drafts', status: 'needs_review' } }}
          className="text-sm text-primary underline"
        >
          {t('actionsReview')}
        </Link>
      }
    >
      {drafts.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('recentEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                href={{ pathname: '/konten/review' }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{shortTopic(d.topic)}</p>
                  <p className="text-xs text-ink-muted">
                    {d.llm_meta?.provider ?? '—'} · {d.llm_meta?.model ?? '—'}
                  </p>
                </div>
                <AdminBadge color={badgeColor(d.status)}>{d.status}</AdminBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}
