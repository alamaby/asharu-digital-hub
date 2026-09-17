'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { LabBatchWithRuns, LabOptions, LabQuota } from '@/lib/lab/types';
import type { LabSummary } from '@/lib/lab/stats';
import { getLabBatch, getLabStats } from '@/lib/lab/actions';
import { LabForm } from './LabForm';
import { LabCompareGrid } from './LabCompareGrid';
import { LabHistory } from './LabHistory';
import { LabStats } from './LabStats';

interface Props {
  locale: string;
  timeZone: string;
  options: LabOptions | null;
  quota: LabQuota | null;
  batches: LabBatchWithRuns[];
  stats: LabSummary | null;
  error: string | null;
}

export function LabPageClient({ locale, timeZone, options, quota, batches, stats, error }: Props) {
  const t = useTranslations('lab');
  const tNav = useTranslations('nav');
  const [, startTransition] = useTransition();

  // Batch histori untuk "Pakai ulang" → form diisi sekali per klik.
  const [reuseBatch, setReuseBatch] = useState<LabBatchWithRuns | null>(null);
  // Hasil submit terakhir (side-by-side) — diambil via getLabBatch agar segar.
  const [lastResult, setLastResult] = useState<LabBatchWithRuns | null>(null);
  // Setiap submit/hapus sukses → riwayat + statistik refresh.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [liveStats, setLiveStats] = useState<LabSummary | null>(stats);

  function handleComplete(batchId: string) {
    startTransition(async () => {
      try {
        const full = await getLabBatch(batchId);
        setLastResult(full);
      } catch {
        setLastResult(null);
      }
      try {
        setLiveStats(await getLabStats());
      } catch {
        // Statistik lama tetap tampil.
      }
      setHistoryRefreshKey((k) => k + 1);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const remaining = quota?.remaining ?? null;
  const limit = quota?.limit ?? null;

  function quotaLabel(): string {
    if (limit === null || limit === undefined) return t('quota.unlimited');
    if (remaining === null) return '';
    return t('quota.remaining', { remaining });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <Link
          href={{ pathname: '/' }}
          locale={locale as 'id' | 'en'}
          className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-primary"
        >
          <span aria-hidden>←</span>
          {tNav('backToSite')}
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
      <p className="mt-2 text-base leading-relaxed text-ink-muted">{t('intro')}</p>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      ) : (
        <div className="mt-2 text-sm text-ink-muted">
          {limit !== null && limit !== undefined ? (
            <span>
              {t('quota.used', { used: quota?.used ?? 0, limit })} · {quotaLabel()}
            </span>
          ) : (
            <span>{t('quota.unlimited')}</span>
          )}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-card">
        <LabForm options={options} quota={quota} reuseBatch={reuseBatch} onComplete={handleComplete} />
      </div>

      <LabCompareGrid result={lastResult} />

      <LabStats summary={liveStats} locale={locale as Locale} />

      <LabHistory
        batches={batches}
        locale={locale as Locale}
        timeZone={timeZone}
        refreshKey={historyRefreshKey}
        onReuse={(b) => {
          setReuseBatch(b);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {batches.length === 0 && !lastResult ? (
        <p className="mt-6 text-sm text-ink-muted">{t('notice.empty')}</p>
      ) : null}
    </div>
  );
}
