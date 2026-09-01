'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { swapAffiliateProduct, removeAffiliateInjection } from '@/lib/content/actions';
import { AffiliateProductPicker } from './AffiliateProductPicker';

interface Injection {
  id?: string;
  friendly_code: string;
  url: string;
  post_index: number;
  match_score?: number;
  match_signals?: { category_match?: boolean; keyword_overlap?: number; scored_from_pool_size?: number };
}

interface Props {
  draftId: string;
  injection: Injection | null;
  matchScore: number | null;
  hasPlaceholderWarning: boolean;
}

function relevanceBand(score: number | null): { label: string; className: string } {
  if (score === null || score === undefined) {
    return { label: '-', className: 'bg-surface text-ink-muted' };
  }
  if (score >= 50) return { label: 'high', className: 'bg-emerald-50 text-emerald-800' };
  if (score >= 10) return { label: 'medium', className: 'bg-amber-50 text-amber-800' };
  return { label: 'low', className: 'bg-red-50 text-red-800' };
}

export function AffiliateProductCard({ draftId, injection, matchScore, hasPlaceholderWarning }: Props) {
  const t = useTranslations('content.review.affiliate');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<'swap' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const band = relevanceBand(matchScore);

  async function onSwap(productId: string) {
    setBusy('swap');
    setError(null);
    setPickerOpen(false);
    const result = await swapAffiliateProduct(draftId, productId);
    setBusy(null);
    if (!result.success) setError(result.error ?? 'failed');
    else startTransition(() => router.refresh());
  }

  async function onRemove() {
    setBusy('remove');
    setError(null);
    const result = await removeAffiliateInjection(draftId);
    setBusy(null);
    if (!result.success) setError(result.error ?? 'failed');
    else startTransition(() => router.refresh());
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('title')}</h2>
        {injection ? (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${band.className}`}>
            {t(`relevance.${band.label}` as never)} · {matchScore ?? 0}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {injection ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              ASH-{injection.friendly_code.replace('ASH-', '')}
            </p>
            <a
              href={injection.url}
              target="_blank"
              rel="noreferrer noopener"
              className="break-words text-xs text-primary underline"
            >
              {t('viewProduct')} ↗
            </a>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={busy !== null}
              aria-busy={busy === 'swap'}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'swap' ? '...' : t('swap')}
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy !== null}
              aria-busy={busy === 'remove'}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'remove' ? '...' : t('remove')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink-muted">{t('noProduct')}</p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={busy !== null}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('swap')}
          </button>
        </div>
      )}

      {hasPlaceholderWarning ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          {t('placeholderWarning')}
        </p>
      ) : null}

      {pickerOpen ? (
        <AffiliateProductPicker
          draftId={draftId}
          currentProductId={injection?.id}
          onSelect={onSwap}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}
