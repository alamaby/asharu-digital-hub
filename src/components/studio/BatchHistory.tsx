'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { StudioGenerationRow, StudioBatchWithCounts, StudioOptions } from '@/lib/studio/types';
import { listStudioBatches, listBatchImages, retryFailedBatchImages, deleteStudioBatch } from '@/lib/studio/actions';

interface Props {
  locale: Locale;
  options: StudioOptions | null;
  /** Data RSC awal (tidak di-poll saat kosong); parent kirim key naik tiap enqueue. */
  batches: StudioBatchWithCounts[];
  refreshKey?: number;
}

export function BatchHistory({ locale, options, batches: initialBatches, refreshKey }: Props) {
  const t = useTranslations('studio.batch.history');
  const tHistory = t;
  const [batches, setBatches] = useState(initialBatches);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [childrenMap, setChildrenMap] = useState<Record<string, StudioGenerationRow[]>>({});
  const [status, setStatus] = useState<Record<string, 'idle' | 'retrying' | 'deleting'>>({
    ...Object.fromEntries(initialBatches.map((b) => [b.id, 'idle']))
  });
  const [isPending, startTransition] = useTransition();
  const [isZipping, setIsZipping] = useState(false);
  // Ref interval agar cleanup bisa clear tanpa race dengan setState.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingIntervalSec = options?.config.polling_interval_sec ?? 10;

  // Clear expanded children bila refreshKey naik (parent enqueue baru).
  useEffect(() => {
    if (!refreshKey) return;
    setExpanded({});
    setChildrenMap({});
  }, [refreshKey]);

  // Polling: aktif bila ada batch dengan pending > 0.
  useEffect(() => {
    const hasPending = batches.some((b) => b.pending > 0);
    if (hasPending && !timerRef.current) {
      timerRef.current = setInterval(async () => {
        try {
          const next = await listStudioBatches();
          setBatches(next);
          // Jikalau ada yang expanded, refresh juga children-nya.
          const toFetch = Object.entries(expanded).filter(([id]) => next.some((b) => b.id === id && b.pending > 0));
          const childPromises: Promise<Map<string, StudioGenerationRow[]>> = Promise.all(
            toFetch.map(async ([id]) => {
              const rows = await listBatchImages(id);
              return [id, rows] as [string, StudioGenerationRow[]];
            })
          ).then((pairs) => new Map(pairs));
          const resolvedChildren = await childPromises;
          setChildrenMap((prev) => {
            const merged = { ...prev };
            for (const [id, rows] of resolvedChildren) merged[id] = rows;
            return merged;
          });
        } catch { /* ignore transisi — parent key akan memicu fetch ulang */ }
      }, pollingIntervalSec * 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [batches, expanded, pollingIntervalSec]);

  async function toggleExpand(batchId: string) {
    const next = !expanded[batchId];
    setExpanded((e) => ({ ...e, [batchId]: next }));
    if (next && !childrenMap[batchId]) {
      const rows = await listBatchImages(batchId).catch(() => []);
      setChildrenMap((c) => ({ ...c, [batchId]: rows }));
    }
  }

  async function handleRetry(batchId: string) {
    startTransition(async () => {
      setStatus((s) => ({ ...s, [batchId]: 'retrying' }));
      try {
        const res = await retryFailedBatchImages(batchId);
        if (res.ok) {
          const n = res.data.retried;
          void n; // untuk nanti notifikasi opsional
          setBatches((prev) =>
            prev.map((b) =>
              b.id === batchId ? { ...b, failed: 0, pending: b.pending + b.failed } : b
            )
          );
        } else {
          void (res as { error: string }).error;
        }
      } finally {
        setStatus((s) => ({ ...s, [batchId]: 'idle' }));
      }
    });
  }

  async function handleDelete(batchId: string) {
    if (!confirm(tHistory('deleteConfirm'))) return;
    startTransition(async () => {
      setStatus((s) => ({ ...s, [batchId]: 'deleting' }));
      try {
        const res = await deleteStudioBatch(batchId);
        if (res.ok) {
          setBatches((prev) => prev.filter((b) => b.id !== batchId));
          setChildrenMap((c) => {
            const next = { ...c };
            delete next[batchId];
            return next;
          });
        }
      } finally {
        setStatus((s) => ({ ...s, [batchId]: 'idle' }));
      }
    });
  }

  async function handleDownloadAll(batch: StudioBatchWithCounts) {
    setIsZipping(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let readyCount = 0;
      let skipped = 0;
      const rows = await listBatchImages(batch.id);
      const readyRows = rows.filter((r): r is StudioGenerationRow & { public_url: string } => r.status === 'ready' && !!r.public_url);
      for (const r of readyRows) {
        try {
          const resp = await fetch(r.public_url);
          const blob = await resp.blob();
          zip.file(buildBatchZipName(batch.id, r as StudioGenerationRow), blob);
          readyCount += 1;
        } catch {
          skipped += 1;
        }
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildBatchZipFileName(batch.id);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (skipped > 0) {
        alert(tHistory('zipReady', { count: readyCount, skipped }));
      }
    } catch {
      alert(tHistory('zipping'));
    } finally {
      setIsZipping(false);
    }
  }

  function hasPending(batch: StudioBatchWithCounts) {
    return batch.pending > 0;
  }

  function batchProgress(batch: StudioBatchWithCounts) {
    const done = batch.ready + batch.failed;
    return tHistory('progress', { done, total: batch.total });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-ink">{tHistory('heading')}</h2>
      {batches.length === 0 ? (
        <p role="status" className="text-sm text-ink-muted">{tHistory('empty')}</p>
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {batches.map((batch) => {
            const isExp = !!expanded[batch.id];
            const children = childrenMap[batch.id] ?? [];
            const busy = status[batch.id] ?? 'idle';
            const btnDisabled = busy !== 'idle' || isPending || isZipping;
            return (
              <div key={batch.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(batch.id)}
                    className="text-ink-muted transition-colors hover:text-ink"
                    aria-expanded={isExp}
                  >
                    {isExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {batch.name ? batch.name : `#${batch.id.slice(0, 6)}`}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {batchProgress(batch)} · {new Date(batch.created_at).toLocaleString(locale)}
                    </p>
                  </div>
                  {hasPending(batch) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      <RefreshCw size={12} className={isPending ? 'animate-spin' : undefined} />
                      {batch.pending}
                    </span>
                  )}
                  {batch.failed > 0 && (
                    <button
                      type="button"
                      disabled={btnDisabled}
                      onClick={() => handleRetry(batch.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === 'retrying'
                        ? tHistory('retrying')
                        : tHistory('retryFailed')}
                    </button>
                  )}
                  {batch.ready > 0 && (
                    <button
                      type="button"
                      disabled={btnDisabled || isZipping}
                      onClick={() => handleDownloadAll(batch)}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isZipping ? (
                        tHistory('zipping')
                      ) : (
                        <>
                          <Download size={12} />
                          {tHistory('downloadAll')}
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={btnDisabled}
                    onClick={() => handleDelete(batch.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                  >
                    {busy === 'deleting' ? tHistory('deleting') : <Trash2 size={12} />}
                  </button>
                </div>
                {isExp && children.length > 0 ? (
                  <div className="mt-3 ml-5 space-y-2 border-t border-line pt-3 text-sm text-ink-muted">
                    {children.map((row) => (
                      <div key={row.id} className="flex items-start gap-2">
                        <StatusBadge status={row.status} />
                        <span className="truncate max-w-xs">{row.image_prompt.slice(0, 80)}</span>
                        <span className="ml-auto text-xs tabular-nums">
                          {new Date(row.created_at).toLocaleTimeString(locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  status: 'pending' | 'ready' | 'failed';
}
function StatusBadge({ status }: StatusBadgeProps) {
  const t = useTranslations('studio.history');
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: t('pending'), cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    ready: { label: t('ready'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    failed: { label: t('failed'), cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
  };
  const v = (map[status] ?? map.pending) as { label: string; cls: string };
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs ${v.cls}`}>
      {v.label}
    </span>
  );
}

function buildBatchZipName(batchId: string, row: StudioGenerationRow): string {
  const safe = row.image_prompt.replace(/[^\w\s-]/g, '').slice(0, 40).replace(/\s+/g, '_');
  return `${safe}-${row.id}.png`;
}

function buildBatchZipFileName(batchId: string): string {
  return `asharu-batch-${batchId.slice(0, 8)}.zip`;
}
