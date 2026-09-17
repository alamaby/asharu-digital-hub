'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateTime } from '@/lib/utils/format';
import type { LabBatchPage, LabBatchRow, LabBatchWithRuns, LabOptions, LabRunRow } from '@/lib/lab/types';
import { deleteLabBatch, listLabBatches } from '@/lib/lab/actions';

interface Props {
  initialPage: LabBatchPage;
  /** Katalog aktif untuk dropdown filter (lengkap, bukan hanya halaman ini). */
  options?: LabOptions | null;
  locale: Locale;
  timeZone: string;
  refreshKey?: number;
  onReuse?: (batch: LabBatchWithRuns) => void;
}

export interface HistoryFilters {
  status: 'all' | 'ok' | 'error';
  providerSlug: string;
  modelSlug: string;
  sortDir: 'desc' | 'asc';
}

const DEFAULT_FILTERS: HistoryFilters = {
  status: 'all',
  providerSlug: '',
  modelSlug: '',
  sortDir: 'desc'
};

const selectCls =
  'w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary';

function pretty(v: unknown): string {
  try {
    if (typeof v === 'string') {
      try {
        return JSON.stringify(JSON.parse(v), null, 2);
      } catch {
        return v;
      }
    }
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const PAGE_SIZE = 10;

export function LabHistory({ initialPage, options, locale, timeZone, refreshKey = 0, onReuse }: Props) {
  const t = useTranslations('lab.history');
  const [pageData, setPageData] = useState<LabBatchPage>(initialPage);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function fetchPage(page: number, f: HistoryFilters) {
    try {
      const res = await listLabBatches({
        page,
        pageSize: PAGE_SIZE,
        dir: f.sortDir,
        providerSlug: f.providerSlug || null,
        modelSlug: f.modelSlug || null,
        status: f.status
      });
      setPageData(res);
    } catch {
      // Biarkan data lama tampil; error fetch bukan fatal.
    }
  }

  function fetchTransition(page: number, f: HistoryFilters) {
    startTransition(async () => fetchPage(page, f));
  }

  // Submit baru → kembali ke halaman 1 agar batch terbaru terlihat.
  useEffect(() => {
    if (refreshKey === 0) return;
    fetchTransition(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function applyFilters(next: HistoryFilters) {
    setFilters(next);
    fetchTransition(1, next);
  }

  function goTo(page: number) {
    const clamped = Math.min(Math.max(1, page), pageData.totalPages);
    fetchTransition(clamped, filters);
  }

  async function copy(runId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(runId);
    setTimeout(() => setCopiedId((c) => (c === runId ? null : c)), 1500);
  }

  async function handleDelete(batchId: string) {
    if (confirmId !== batchId) {
      setConfirmId(batchId);
      return;
    }
    setBusyId(batchId);
    const res = await deleteLabBatch(batchId);
    setBusyId(null);
    setConfirmId(null);
    if (res.ok) {
      // Re-fetch halaman aktif; mundur 1 halaman bila halaman jadi kosong.
      const next = await listLabBatches({
        page: pageData.page,
        pageSize: PAGE_SIZE,
        dir: filters.sortDir,
        providerSlug: filters.providerSlug || null,
        modelSlug: filters.modelSlug || null,
        status: filters.status
      }).catch(() => null);
      if (next && next.items.length === 0 && next.page > 1) {
        fetchTransition(next.page - 1, filters);
      } else if (next) {
        setPageData(next);
      }
    }
  }

  const providerOpts = (options?.providers ?? []).map((p) => p.slug).sort();
  const modelOpts = (options?.models ?? [])
    .filter((m) => !filters.providerSlug || m.provider_id === (options?.providers ?? []).find((p) => p.slug === filters.providerSlug)?.id)
    .map((m) => m.model_id)
    .sort();

  function runBadge(run: LabRunRow) {
    if (run.error) return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">{t('error')}</span>;
    return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">{t('ok')}</span>;
  }

  return (
    <section aria-label={t('heading')} className="mt-10">
      <h2 className="text-lg font-semibold text-ink">{t('heading')}</h2>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-ink-muted">
          {t('filterStatus')}
          <select
            value={filters.status}
            onChange={(e) => applyFilters({ ...filters, status: e.target.value as HistoryFilters['status'] })}
            className={selectCls}
          >
            <option value="all">{t('all')}</option>
            <option value="ok">{t('ok')}</option>
            <option value="error">{t('error')}</option>
          </select>
        </label>
        <label className="block text-xs text-ink-muted">
          {t('filterProvider')}
          <select
            value={filters.providerSlug}
            onChange={(e) => applyFilters({ ...filters, providerSlug: e.target.value })}
            className={selectCls}
          >
            <option value="">{t('all')}</option>
            {providerOpts.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-ink-muted">
          {t('filterModel')}
          <select
            value={filters.modelSlug}
            onChange={(e) => applyFilters({ ...filters, modelSlug: e.target.value })}
            className={selectCls}
          >
            <option value="">{t('all')}</option>
            {modelOpts.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-ink-muted">
          {t('sortLabel')}
          <select
            value={filters.sortDir}
            onChange={(e) => applyFilters({ ...filters, sortDir: e.target.value as 'desc' | 'asc' })}
            className={selectCls}
          >
            <option value="desc">{t('sortNewest')}</option>
            <option value="asc">{t('sortOldest')}</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => applyFilters(DEFAULT_FILTERS)}
        className="mt-2 text-xs text-primary hover:underline"
      >
        {t('clearFilters')}
      </button>

      {pageData.items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{t('noResults')}</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {pageData.items.map(({ batch, runs }: { batch: LabBatchRow; runs: LabRunRow[] }) => (
            <li key={batch.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium text-ink" title={batch.user_prompt}>
                    {batch.user_prompt}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatDateTime(batch.created_at, locale, timeZone)} · {runs.length} target
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={{ pathname: '/lab/[batchId]', params: { batchId: batch.id } }}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-primary"
                  >
                    {t('openDetail')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onReuse?.({ batch, runs })}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-primary"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {t('reuse')}
                  </button>
                  {confirmId === batch.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(batch.id)}
                        disabled={busyId === batch.id}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        {busyId === batch.id ? t('deleting') : t('deleteConfirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted"
                      >
                        {t('cancelDelete')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDelete(batch.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-red-600"
                      aria-label={t('delete')}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {t('delete')}
                    </button>
                  )}
                </div>
              </div>

              <ul className="mt-3 space-y-2">
                {runs.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-ink">
                        {r.provider_slug || '—'} / {(r.model_slug || '').split('/').pop() || '—'}
                      </span>
                      {runBadge(r)}
                      <span className="font-mono text-ink-muted">
                        {r.latency_ms ?? '-'}ms · {r.tokens_per_sec ?? '-'} tok/s · p:{r.prompt_tokens ?? '-'} c:{r.completion_tokens ?? '-'} t:{r.total_tokens ?? '-'}
                      </span>
                    </div>
                    {r.error ? (
                      <p className="mt-1 text-xs text-red-600">{r.error.slice(0, 400)}</p>
                    ) : (
                      <>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-ink-muted">{r.response_text}</p>
                        <button
                          type="button"
                          onClick={() => copy(r.id, r.response_text ?? '')}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {copiedId === r.id ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                          {copiedId === r.id ? 'OK' : t('responseLabel')}
                        </button>
                      </>
                    )}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary">{t('detailLog')}</summary>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-[11px]">
                        {pretty({ request: r.request_messages, response: r.response_text ?? r.error, finish: r.finish_reason, fallback: r.is_fallback, truncated: r.response_truncated })}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-ink-muted">
          {t('pageOf', { page: pageData.page, total: pageData.totalPages })} · {pageData.total}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => goTo(pageData.page - 1)}
            disabled={pageData.page <= 1}
            className="rounded border border-line px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('prev')}
          </button>
          <button
            type="button"
            onClick={() => goTo(pageData.page + 1)}
            disabled={pageData.page >= pageData.totalPages}
            className="rounded border border-line px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </section>
  );
}
