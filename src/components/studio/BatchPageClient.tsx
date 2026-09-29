'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { StudioBatchWithCounts, StudioOptions, StudioQuota } from '@/lib/studio/types';
import { BatchForm } from './BatchForm';
import { BatchHistory } from './BatchHistory';

interface Props {
  locale: Locale;
  options: StudioOptions | null;
  quota: StudioQuota | null;
  batches: StudioBatchWithCounts[];
  error: string | null;
}

export function BatchPageClient({ locale, options, quota, batches, error }: Props) {
  const t = useTranslations('studio.batch');
  const tStudioQuota = useTranslations('studio.quota');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [refreshKey, setRefreshKey] = useState(0);

  function handleEnqueued() {
    setRefreshKey((k) => k + 1);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
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
        <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>
      ) : (
        <div className="mt-2 text-sm text-ink-muted">
          {quota?.limit === null || quota?.limit === undefined
            ? tStudioQuota('unlimited')
            : tStudioQuota('used', { used: quota.used, limit: quota.limit }) +
              (quota.remaining !== null && quota.remaining !== undefined
                ? ` · ${tStudioQuota('remaining', { remaining: quota.remaining })}`
                : '')}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-card">
        <BatchForm options={options} onEnqueued={handleEnqueued} />
      </div>

      <BatchHistory
        locale={locale}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        options={options}
        batches={batches}
        refreshKey={refreshKey}
      />
      {batches.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">{t('history.empty')}</p>
      ) : null}
    </div>
  );
}
