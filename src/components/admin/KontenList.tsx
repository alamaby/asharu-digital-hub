'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';

interface Platform {
  slug: string;
  display_name: string;
}

export interface RequestRow {
  id: string;
  topic: string;
  platform_slug: string;
  status: string;
  created_at: string;
  target_category: string | null;
  attempts: number;
}

export interface DraftRow {
  id: string;
  request_id: string;
  status: string;
  created_at: string;
  generated_thread: { main: { id: string; en: string } };
  affiliate_injections: { friendly_code: string; post_index: number }[];
  llm_meta?: { provider: string; model: string };
  request: { topic: string; platform_slug: string; target_category: string | null } | null;
}

export interface KontenFilters {
  status: string;
  type: string;
  platform: string;
  date: string;
  sort: string;
}

interface KontenListProps {
  requests: RequestRow[];
  drafts: DraftRow[];
  platforms: Platform[];
  filters: KontenFilters;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'needs_review'
      ? 'bg-amber-50 text-amber-800'
      : status === 'approved'
        ? 'bg-emerald-50 text-emerald-800'
        : status === 'rejected'
          ? 'bg-red-50 text-red-800'
          : status === 'failed'
            ? 'bg-red-50 text-red-800'
            : status === 'processing'
              ? 'bg-blue-50 text-blue-800'
              : status === 'pending'
                ? 'bg-surface text-ink-muted'
                : 'bg-surface text-ink-muted';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function shortTopic(topic: string, max = 60): string {
  if (!topic) return '—';
  if (topic.length <= max) return topic;
  return topic.slice(0, max - 1) + '…';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso;
  }
}

export function KontenList({
  requests,
  drafts,
  platforms,
  filters,
  page,
  totalPages,
  totalCount,
  pageSize
}: KontenListProps) {
  const t = useTranslations('admin.konten');
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const pageFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageTo = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('intro')}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const params = new URLSearchParams();
          for (const [key, value] of formData.entries()) {
            const v = value.toString();
            if (v && v !== 'all' && v !== 'both' && v !== 'newest') {
              params.set(key, v);
            }
          }
          const qs = params.toString();
          startTransition(() => {
            router.push(`${pathname}${qs ? `?${qs}` : ''}` as never);
          });
        }}
        className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:grid-cols-5"
      >
        <FilterSelect label={t('filterStatus')} name="status" value={filters.status} options={[
          { value: 'all', label: t('statusAll') },
          { value: 'pending', label: 'pending' },
          { value: 'processing', label: 'processing' },
          { value: 'needs_review', label: 'needs_review' },
          { value: 'approved', label: 'approved' },
          { value: 'rejected', label: 'rejected' },
          { value: 'failed', label: 'failed' }
        ]} />
        <FilterSelect label={t('filterType')} name="type" value={filters.type} options={[
          { value: 'both', label: t('typeBoth') },
          { value: 'requests', label: t('typeRequests') },
          { value: 'drafts', label: t('typeDrafts') }
        ]} />
        <FilterSelect label={t('filterPlatform')} name="platform" value={filters.platform} options={[
          { value: 'all', label: t('platformAll') },
          ...platforms.map((p) => ({ value: p.slug, label: p.display_name }))
        ]} />
        <FilterSelect label={t('filterDate')} name="date" value={filters.date} options={[
          { value: 'all', label: t('dateAll') },
          { value: '7d', label: t('date7d') },
          { value: '30d', label: t('date30d') }
        ]} />
        <FilterSelect label={t('sortLabel')} name="sort" value={filters.sort} options={[
          { value: 'newest', label: t('sortNewest') },
          { value: 'oldest', label: t('sortOldest') }
        ]} />
        <div className="col-span-2 flex items-end gap-2 sm:col-span-5">
          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? (
              <svg viewBox="0 0 20 20" fill="none" className="size-4 animate-spin" aria-hidden>
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : null}
            <span>{t('apply')}</span>
          </button>
          <Link href={pathname as never} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink hover:border-primary">
            {t('reset')}
          </Link>
        </div>
      </form>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-background text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2">{t('colTopic')}</th>
              <th className="px-4 py-2">{t('colPlatform')}</th>
              <th className="px-4 py-2">{t('colStatus')}</th>
              <th className="px-4 py-2">{t('colCategory')}</th>
              <th className="px-4 py-2">{t('colProvider')}</th>
              <th className="px-4 py-2">{t('colCreated')}</th>
              <th className="px-4 py-2">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={`req-${r.id}`} className="border-b border-line last:border-0">
                <td className="max-w-md truncate px-4 py-2" title={r.topic}>{shortTopic(r.topic, 80)}</td>
                <td className="px-4 py-2 text-ink-muted">{r.platform_slug}</td>
                <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2 text-ink-muted">{r.target_category ?? '—'}</td>
                <td className="px-4 py-2 text-ink-muted">—</td>
                <td className="px-4 py-2 text-xs text-ink-muted">{formatDate(r.created_at)}</td>
                <td className="px-4 py-2">
                  <Link href={{ pathname: '/konten/review' }} className="text-xs text-primary underline">
                    {t('viewDraft')}
                  </Link>
                </td>
              </tr>
            ))}
            {drafts.map((d) => (
              <tr key={`draft-${d.id}`} className="border-b border-line last:border-0">
                <td className="max-w-md truncate px-4 py-2" title={d.request?.topic ?? ''}>
                  {shortTopic(d.request?.topic ?? '—', 80)}
                </td>
                <td className="px-4 py-2 text-ink-muted">{d.request?.platform_slug ?? '—'}</td>
                <td className="px-4 py-2"><StatusBadge status={d.status} /></td>
                <td className="px-4 py-2 text-ink-muted">{d.request?.target_category ?? '—'}</td>
                <td className="px-4 py-2 text-ink-muted">
                  {d.llm_meta?.provider ?? '—'} {d.llm_meta?.model ? `· ${d.llm_meta.model}` : ''}
                </td>
                <td className="px-4 py-2 text-xs text-ink-muted">{formatDate(d.created_at)}</td>
                <td className="px-4 py-2">
                  <Link href={{ pathname: '/konten/review' }} className="text-xs text-primary underline">
                    {t('viewDraft')}
                  </Link>
                </td>
              </tr>
            ))}
            {requests.length === 0 && drafts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-muted">
                  {t('empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul className="space-y-3 md:hidden">
        {[...requests.map((r) => ({ kind: 'req' as const, row: r })), ...drafts.map((d) => ({ kind: 'draft' as const, row: d }))].map((item) => {
          if (item.kind === 'req') {
            const r = item.row;
            return (
              <li key={`m-req-${r.id}`} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{shortTopic(r.topic, 100)}</p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-xs text-ink-muted">{r.platform_slug} · {formatDate(r.created_at)}</p>
                <p className="mt-1 text-xs text-ink-muted">Kategori: {r.target_category ?? '—'} · attempts: {r.attempts}</p>
              </li>
            );
          }
          const d = item.row;
          return (
            <li key={`m-draft-${d.id}`} className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">{shortTopic(d.request?.topic ?? '—', 100)}</p>
                <StatusBadge status={d.status} />
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {d.request?.platform_slug ?? '—'} · {formatDate(d.created_at)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {d.llm_meta?.provider ?? '—'} {d.llm_meta?.model ? `· ${d.llm_meta.model}` : ''}
              </p>
            </li>
          );
        })}
        {requests.length === 0 && drafts.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-muted">
            {t('empty')}
          </li>
        ) : null}
      </ul>

      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="pagination">
        <p className="text-sm text-ink-muted">
          {t('pageOf', { page })} · {pageFrom}–{pageTo} dari {totalCount}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <PaginationLink
              href={`${pathname}?${new URLSearchParams({
                ...(filters.status !== 'all' ? { status: filters.status } : {}),
                ...(filters.type !== 'both' ? { type: filters.type } : {}),
                ...(filters.platform !== 'all' ? { platform: filters.platform } : {}),
                ...(filters.date !== 'all' ? { date: filters.date } : {}),
                ...(filters.sort !== 'newest' ? { sort: filters.sort } : {}),
                page: String(page - 1)
              }).toString()}`}
              label={t('pagePrev')}
              isPending={isPending}
              onNavigate={(href) => startTransition(() => router.push(href as never))}
            />
          ) : null}
          {page < totalPages ? (
            <PaginationLink
              href={`${pathname}?${new URLSearchParams({
                ...(filters.status !== 'all' ? { status: filters.status } : {}),
                ...(filters.type !== 'both' ? { type: filters.type } : {}),
                ...(filters.platform !== 'all' ? { platform: filters.platform } : {}),
                ...(filters.date !== 'all' ? { date: filters.date } : {}),
                ...(filters.sort !== 'newest' ? { sort: filters.sort } : {}),
                page: String(page + 1)
              }).toString()}`}
              label={t('pageNext')}
              isPending={isPending}
              onNavigate={(href) => startTransition(() => router.push(href as never))}
            />
          ) : null}
        </div>
      </nav>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
}

function FilterSelect({ label, name, value, options }: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-muted">
      <span className="font-medium uppercase tracking-wide">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-lg border border-line bg-background px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function PaginationLink({
  href,
  label,
  isPending,
  onNavigate
}: {
  href: string;
  label: string;
  isPending: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(href)}
      disabled={isPending}
      aria-busy={isPending}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-primary disabled:pointer-events-none disabled:opacity-60"
    >
      {isPending ? (
        <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null}
      <span>{label}</span>
    </button>
  );
}
