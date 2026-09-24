'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { LabBatchPage, LabBatchWithRuns, LabOptions, LabQuota } from '@/lib/lab/types';
import type { LabSummary } from '@/lib/lab/stats';
import { getLabBatch } from '@/lib/lab/actions';
import { LabForm } from './LabForm';
import { LabCompareGrid } from './LabCompareGrid';
import { LabHistory } from './LabHistory';
import { LabStats } from './LabStats';

interface Props {
  locale: string;
  timeZone: string;
  options: LabOptions | null;
  quota: LabQuota | null;
  initialPage: LabBatchPage;
  stats: LabSummary | null;
  error: string | null;
}

export function LabPageClient({ locale, timeZone, options, quota, initialPage, stats, error }: Props) {
  const t = useTranslations('lab');
  const tNav = useTranslations('nav');
  const [, startTransition] = useTransition();

  // Batch histori untuk "Pakai ulang" → form diisi sekali per klik.
  const [reuseBatch, setReuseBatch] = useState<LabBatchWithRuns | null>(null);
  // Hasil submit terakhir (side-by-side) — diambil via getLabBatch agar segar.
  const [lastResult, setLastResult] = useState<LabBatchWithRuns | null>(null);
  // Setiap submit sukses → riwayat (hal. 1) + statistik (rentang aktif) refresh.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  function handleComplete(batchId: string) {
    startTransition(async () => {
      try {
        const full = await getLabBatch(batchId);
        setLastResult(full);
      } catch {
        setLastResult(null);
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

      {/* Tab navigation */}
      <nav aria-label={tNav('chatLab')} className="mt-6 border-b border-line">
        <ul className="flex gap-0">
          <li>
            <Link
              href={{ pathname: '/lab' }}
              locale={locale as 'id' | 'en'}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                '/lab' === '/lab'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
              }`}
            >
              {t('tabCompare')}
            </Link>
          </li>
          <li>
            <Link
              href={{ pathname: '/lab/try' }}
              locale={locale as 'id' | 'en'}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                '/lab/try' === '/lab/try'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
              }`}
            >
              {t('tabTry')}
            </Link>
          </li>
        </ul>
      </nav>

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

      <LabStats initial={stats} locale={locale as Locale} refreshKey={historyRefreshKey} />

      <LabHistory
        initialPage={initialPage}
        options={options}
        locale={locale as Locale}
        timeZone={timeZone}
        refreshKey={historyRefreshKey}
        onReuse={(b) => {
          setReuseBatch(b);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {initialPage.total === 0 && !lastResult ? (
        <p className="mt-6 text-sm text-ink-muted">{t('notice.empty')}</p>
      ) : null}
    </div>
  );
}
