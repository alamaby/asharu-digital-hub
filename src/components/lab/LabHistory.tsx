'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateTime } from '@/lib/utils/format';
import type { LabBatchRow, LabBatchWithRuns, LabRunRow } from '@/lib/lab/types';
import { deleteLabBatch, listLabBatches } from '@/lib/lab/actions';

interface Props {
  batches: LabBatchWithRuns[];
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

export function LabHistory({ batches: initial, locale, timeZone, refreshKey = 0, onReuse }: Props) {
  const t = useTranslations('lab.history');
  const [batches, setBatches] = useState<LabBatchWithRuns[]>(initial);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Sinkron dari parent (submit baru) + re-fetch saat refreshKey berubah.
  useEffect(() => {
    setBatches(initial);
  }, [initial]);
  useEffect(() => {
    if (refreshKey === 0) return;
    startTransition(async () => {
      try {
        const rows = await listLabBatches({
          limit: 20,
          dir: filters.sortDir,
          providerSlug: filters.providerSlug || null,
          modelSlug: filters.modelSlug || null,
          status: filters.status
        });
        setBatches(rows);
      } catch {
        // Biarkan data lama tampil; error fetch bukan fatal.
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function applyFilters(next: HistoryFilters) {
    setFilters(next);
    startTransition(async () => {
      try {
        const rows = await listLabBatches({
          limit: 20,
          dir: next.sortDir,
          providerSlug: next.providerSlug || null,
          modelSlug: next.modelSlug || null,
          status: next.status
        });
        setBatches(rows);
      } catch {
        // Biarkan data lama tampil.
      }
    });
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
    if (res.ok) setBatches((prev) => prev.filter((b) => b.batch.id !== batchId));
  }

  const providerOpts = Array.from(new Set(batches.flatMap((b) => b.runs.map((r) => r.provider_slug)).filter(Boolean))).sort();
  const modelOpts = Array.from(new Set(batches.flatMap((b) => b.runs.map((r) => r.model_slug)).filter(Boolean))).sort();

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

      {batches.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{t('noResults')}</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {batches.map(({ batch, runs }: { batch: LabBatchRow; runs: LabRunRow[] }) => (
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
    </section>
  );
}
