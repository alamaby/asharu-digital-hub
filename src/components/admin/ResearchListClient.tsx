'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { formatDateTime } from '@/lib/utils/format';

const STATUS_BG: Record<string, string> = {
  pending: 'bg-surface text-ink-muted',
  discovering: 'bg-blue-50 text-blue-800',
  verifying: 'bg-blue-50 text-blue-800',
  scoring: 'bg-blue-50 text-blue-800',
  awaiting_selection: 'bg-amber-50 text-amber-800',
  developing: 'bg-blue-50 text-blue-800',
  completed: 'bg-emerald-50 text-emerald-800',
  failed: 'bg-red-50 text-red-800'
};

interface Props {
  sessions: Array<{ id: string; status: string; topic: string | null; target_location: string | null; platform_slug: string | null; created_at: string; error_message: string | null }>;
  sessionsError: string | null;
  platforms: { slug: string; display_name: string }[];
  filters: { status: string; platform: string; date: string; sort: string; page: number };
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  locale: string;
  timeZone: string;
}

export function ResearchListClient({ sessions, sessionsError, platforms, filters, page, totalPages, totalCount, locale, timeZone }: Props) {
  const t = useTranslations('admin.research');
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleFilterSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const status = String(fd.get('status') ?? 'all');
    const platform = String(fd.get('platform') ?? 'all');
    const date = String(fd.get('date') ?? 'all');
    const sort = String(fd.get('sort') ?? 'newest');
    if (status !== 'all') params.set('status', status);
    if (platform !== 'all') params.set('platform', platform);
    if (date !== 'all') params.set('date', date);
    if (sort !== 'newest') params.set('sort', sort);
    const qs = params.toString();
    startTransition(() => router.push((qs ? `${pathname}?${qs}` : pathname) as never));
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={handleFilterSubmit} className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-xs font-medium text-ink-muted">
            Status
            <select name="status" defaultValue={filters.status} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="all">Semua status</option>
              <option value="pending">pending</option>
              <option value="discovering">discovering</option>
              <option value="verifying">verifying</option>
              <option value="scoring">scoring</option>
              <option value="awaiting_selection">awaiting_selection</option>
              <option value="developing">developing</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Platform
            <select name="platform" defaultValue={filters.platform} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="all">Semua platform</option>
              {platforms.map((p) => (
                <option key={p.slug} value={p.slug}>{p.display_name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Periode
            <select name="date" defaultValue={filters.date} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="all">Semua waktu</option>
              <option value="7d">7 hari</option>
              <option value="30d">30 hari</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Urutan
            <select name="sort" defaultValue={filters.sort} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isPending ? 'Memuat…' : 'Terapkan'}
          </button>
          <Link href={{ pathname: '/admin/riset' }} className="rounded-lg border border-line px-4 py-2 text-sm">
            Reset
          </Link>
          <span className="ml-auto text-xs text-ink-muted">{totalCount} total · hal {page}/{totalPages}</span>
        </div>
      </form>

      <ul className="space-y-2">
        {sessionsError ? (
          <li className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Query error: {sessionsError}</li>
        ) : sessions.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">{t('empty')}</li>
        ) : (
          sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId: s.id } }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{s.topic ?? s.target_location ?? t('sessionLabel', { id: s.id.slice(0, 8) })}</p>
                  <p className="text-xs text-ink-muted">
                    {s.platform_slug ?? t('platformAll')} · {formatDateTime(s.created_at, locale as never, timeZone)} · {s.target_location ?? '-'}
                  </p>
                  {s.error_message ? <p className="truncate text-xs text-red-600">{s.error_message.slice(0, 80)}</p> : null}
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BG[s.status] ?? 'bg-surface text-ink-muted'}`}>{s.status}</span>
              </Link>
            </li>
          ))
        )}
      </ul>

      <nav aria-label="pagination" className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">Hal {page} dari {totalPages}</span>
        <div className="flex gap-2">
          <Link
            href={{ pathname: '/admin/riset', query: { ...filters, page: String(page - 1) } }}
            className={`rounded-lg border px-3 py-1 text-sm ${page <= 1 ? 'pointer-events-none opacity-40' : 'border-line hover:border-primary'}`}
            aria-disabled={page <= 1}
          >
            Prev
          </Link>
          <Link
            href={{ pathname: '/admin/riset', query: { ...filters, page: String(page + 1) } }}
            className={`rounded-lg border px-3 py-1 text-sm ${page >= totalPages ? 'pointer-events-none opacity-40' : 'border-line hover:border-primary'}`}
            aria-disabled={page >= totalPages}
          >
            Next
          </Link>
        </div>
      </nav>
    </div>
  );
}
