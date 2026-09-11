'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { StudioOptions, StudioQuota } from '@/lib/studio/types';
import { StudioForm } from './StudioForm';
import { StudioHistory } from './StudioHistory';
import type { StudioGenerationRow } from '@/lib/studio/types';

interface Props {
  locale: string;
  /** Zona waktu display user untuk timestamp riwayat. */
  timeZone: string;
  options: StudioOptions | null;
  quota: StudioQuota | null;
  images: StudioGenerationRow[];
  error: string | null;
}

export function StudioPageClient({ locale, timeZone, options, quota, images, error }: Props) {
  const t = useTranslations('studio');
  const tNav = useTranslations('nav');

  // "Pakai ulang" dari riwayat → form diisi dari baris ini (sekali per klik).
  const [reuseRow, setReuseRow] = useState<StudioGenerationRow | null>(null);

  const pollingIntervalSec = options?.config.polling_interval_sec ?? 10;
  const remaining = quota?.remaining ?? null;
  const limit = quota?.limit ?? null;

  function quotaLabel(): string {
    if (limit === null || limit === undefined) return t('quota.unlimited');
    if (remaining === null) return '';
    return t('quota.remaining', { remaining });
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
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      ) : (
        <div className="mt-2 text-sm text-ink-muted">
          {limit !== null && limit !== undefined ? (
            <span>
              {t('quota.used', { used: quota?.used ?? 0, limit: limit })} · {quotaLabel()}
            </span>
          ) : (
            <span>{t('quota.unlimited')}</span>
          )}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-card">
        <StudioForm options={options} quota={quota} reuseRow={reuseRow} />
      </div>

      <StudioHistory
        images={images}
        pollingIntervalSec={pollingIntervalSec}
        options={options}
        locale={locale as Locale}
        timeZone={timeZone}
        onReuse={(img) => {
          setReuseRow(img);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {images.length === 0 ? <p className="mt-6 text-sm text-ink-muted">{t('notice.empty')}</p> : null}
    </div>
  );
}
