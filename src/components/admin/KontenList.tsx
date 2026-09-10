'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateTime } from '@/lib/utils/format';
import {
  defaultDirFor,
  type KontenItem,
  type KontenSortDir,
  type KontenSortKey
} from '@/lib/admin/konten-list';

interface Platform {
  slug: string;
  display_name: string;
}

export interface KontenFilters {
  status: string;
  type: string;
  platform: string[];
  date: string;
  sort: KontenSortKey;
  dir: KontenSortDir;
}

interface KontenListProps {
  items: KontenItem[];
  platforms: Platform[];
  filters: KontenFilters;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  /** Resolved display timezone (user pref -> device -> Asia/Jakarta). */
  timeZone: string;
  locale: Locale;
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

function shortTopic(topic: string | null, max = 60): string {
  if (!topic) return '—';
  if (topic.length <= max) return topic;
  return topic.slice(0, max - 1) + '…';
}

function formatRowDate(iso: string, locale: Locale, timeZone: string): string {
  const formatted = formatDateTime(iso, locale, timeZone);
  // formatDateTime falls back to an ISO slice on error; guard garbage too.
  return formatted || new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

function queryString(
  filters: KontenFilters,
  overrides: Partial<Record<'status' | 'type' | 'platform' | 'date' | 'sort' | 'dir' | 'page', string | undefined>>
): string {
  const params = new URLSearchParams();
  const status = overrides.status !== undefined ? overrides.status : filters.status !== 'all' ? filters.status : undefined;
  const type = overrides.type !== undefined ? overrides.type : filters.type !== 'both' ? filters.type : undefined;
  const date = overrides.date !== undefined ? overrides.date : filters.date !== 'all' ? filters.date : undefined;
  const sortKey = (overrides.sort ?? filters.sort) as KontenSortKey;
  const sort = overrides.sort !== undefined ? overrides.sort : filters.sort !== 'created' ? filters.sort : undefined;
  const dirVal = overrides.dir ?? filters.dir;
  const dir = dirVal !== defaultDirFor(sortKey) ? dirVal : undefined;
  const platformList = overrides.platform !== undefined ? overrides.platform : filters.platform.length > 0 ? filters.platform.join(',') : undefined;
  const page = overrides.page;
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  if (platformList) params.set('platform', platformList);
  if (date) params.set('date', date);
  if (sort) params.set('sort', sort);
  if (dir) params.set('dir', dir);
  if (page) params.set('page', page);
  return params.toString();
}

const SORT_COLUMNS: { key: KontenSortKey; labelKey: 'colTopic' | 'colPlatform' | 'colStatus' | 'colCategory' | 'colProvider' | 'colCreated' }[] = [
  { key: 'topic', labelKey: 'colTopic' },
  { key: 'platform', labelKey: 'colPlatform' },
  { key: 'status', labelKey: 'colStatus' },
  { key: 'category', labelKey: 'colCategory' },
  { key: 'provider', labelKey: 'colProvider' },
  { key: 'created', labelKey: 'colCreated' }
];

export function KontenList({
  items,
  platforms,
  filters,
  page,
  totalPages,
  totalCount,
  pageSize,
  timeZone,
  locale
}: KontenListProps) {
  const t = useTranslations('admin.konten');
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(filters.platform);
  const [platformOpen, setPlatformOpen] = useState(false);
  // Sinkronkan checkbox saat filter terapan berubah via navigasi (Reset/back/link).
  useEffect(() => {
    setSelectedPlatforms(filters.platform);
  }, [filters.platform]);

  const pageFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageTo = Math.min(page * pageSize, totalCount);

  const navigate = (qs: string) => {
    startTransition(() => {
      router.push(`${pathname}${qs ? `?${qs}` : ''}` as never);
    });
  };

  const toggleSort = (key: KontenSortKey) => {
    const nextDir: KontenSortDir =
      filters.sort === key ? (filters.dir === 'asc' ? 'desc' : 'asc') : defaultDirFor(key);
    navigate(queryString(filters, { sort: key, dir: nextDir }));
  };

  const togglePlatform = (slug: string) => {
    setSelectedPlatforms((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

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
            if (key === 'platform') continue;
            const v = value.toString();
            if (v && v !== 'all' && v !== 'both') {
              params.set(key, v);
            }
          }
          if (selectedPlatforms.length > 0) params.set('platform', selectedPlatforms.join(','));
          if (filters.sort !== 'created') params.set('sort', filters.sort);
          if (filters.dir !== defaultDirFor(filters.sort)) params.set('dir', filters.dir);
          navigate(params.toString());
        }}
        className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:grid-cols-4"
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
        <div className="flex flex-col gap-1 text-xs text-ink-muted">
          <span className="font-medium uppercase tracking-wide">{t('filterPlatform')}</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlatformOpen((v) => !v)}
              aria-expanded={platformOpen}
              className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-left text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {selectedPlatforms.length === 0
                ? t('platformAll')
                : t('platformCountHint', { count: selectedPlatforms.length })}
            </button>
            {platformOpen ? (
              <div className="absolute z-10 mt-1 max-h-56 w-56 overflow-auto rounded-lg border border-line bg-surface p-2 shadow-card">
                <div className="flex gap-2 pb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlatforms(platforms.map((p) => p.slug))}
                    className="rounded border border-line px-2 py-0.5 text-xs text-ink hover:border-primary"
                  >
                    {t('platformSelectAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPlatforms([])}
                    className="rounded border border-line px-2 py-0.5 text-xs text-ink hover:border-primary"
                  >
                    {t('platformClear')}
                  </button>
                </div>
                {platforms.map((p) => (
                  <label key={p.slug} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-background has-checked:border-primary">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(p.slug)}
                      onChange={() => togglePlatform(p.slug)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    {p.display_name}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <FilterSelect label={t('filterDate')} name="date" value={filters.date} options={[
          { value: 'all', label: t('dateAll') },
          { value: '7d', label: t('date7d') },
          { value: '30d', label: t('date30d') }
        ]} />
        <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
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
              {SORT_COLUMNS.map((col) => {
                const active = filters.sort === col.key;
                const arrow = active ? (filters.dir === 'asc' ? ' ▲' : ' ▼') : '';
                return (
                  <th key={col.key} className="px-4 py-2" aria-sort={active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      aria-label={t('sortBy', { column: t(col.labelKey) })}
                      className="font-medium uppercase tracking-wide hover:text-ink"
                    >
                      {t(col.labelKey)}{arrow}
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-2">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.kind}-${item.id}`} className="border-b border-line last:border-0">
                <td className="max-w-md truncate px-4 py-2" title={item.topic ?? ''}>{shortTopic(item.topic, 80)}</td>
                <td className="px-4 py-2 text-ink-muted">{item.platform ?? '—'}</td>
                <td className="px-4 py-2"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-2 text-ink-muted">{item.category ?? '—'}</td>
                <td className="px-4 py-2 text-ink-muted">
                  {item.provider ?? '—'}{item.model ? ` · ${item.model}` : ''}
                </td>
                <td className="px-4 py-2 text-xs text-ink-muted">{formatRowDate(item.createdAt, locale, timeZone)}</td>
                <td className="px-4 py-2">
                  <Link href={{ pathname: '/konten/review' }} className="text-xs text-primary underline">
                    {t('viewDraft')}
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
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
        {items.map((item) => (
          <li key={`m-${item.kind}-${item.id}`} className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-ink">{shortTopic(item.topic, 100)}</p>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-1 text-xs text-ink-muted">{item.platform ?? '—'} · {formatRowDate(item.createdAt, locale, timeZone)}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {t('colCategory')}: {item.category ?? '—'}
              {item.kind === 'request' ? ` · ${t('colAttempts')}: ${item.attempts ?? 0}` : ''}
            </p>
            {item.provider ? (
              <p className="mt-1 text-xs text-ink-muted">
                {item.provider}{item.model ? ` · ${item.model}` : ''}
              </p>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-muted">
            {t('empty')}
          </li>
        ) : null}
      </ul>

      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="pagination">
        <p className="text-sm text-ink-muted">
          {t('pageOf', { page, total: totalPages })} · {t('rangeInfo', { from: pageFrom, to: pageTo, count: totalCount })}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <PaginationLink
              href={`${pathname}?${queryString(filters, { page: String(page - 1) })}`}
              label={t('pagePrev')}
              isPending={isPending}
              onNavigate={(href) => startTransition(() => router.push(href as never))}
            />
          ) : null}
          {page < totalPages ? (
            <PaginationLink
              href={`${pathname}?${queryString(filters, { page: String(page + 1) })}`}
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
