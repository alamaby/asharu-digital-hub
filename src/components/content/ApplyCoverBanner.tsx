'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle, Loader2 } from 'lucide-react';
import { applyDraftCoverToArticle } from '@/lib/articles/actions';
import { localizedPathname } from '@/lib/seo/paths';

export function ApplyCoverBanner({
  draftId,
  draftImageId,
  liveUrl,
  draftUrl,
  locale,
  slug,
  publishedLocaleCount
}: {
  draftId: string;
  draftImageId: string | null;
  /** URL cover yang saat ini LIVE di artikel publish (null = live tanpa cover). */
  liveUrl: string | null;
  /** URL cover draf terpilih (null = draf tanpa cover). */
  draftUrl: string | null;
  locale: string;
  slug: string;
  /** Jumlah locale terbit dari draf ini (untuk teks "+N locale lain"). */
  publishedLocaleCount: number;
}) {
  const t = useTranslations('content.review');
  const [pending, startPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSynced = Boolean(liveUrl && draftUrl && liveUrl === draftUrl);
  const canApply = Boolean(draftImageId && draftUrl && !isSynced);

  async function onApply() {
    if (!draftImageId) return;
    setError(null);
    setDone(false);
    startPending(true);
    try {
      const res = await applyDraftCoverToArticle(draftId, draftImageId);
      if (!res.success) {
        setError(res.error ?? 'Gagal menerapkan cover.');
      } else {
        setDone(true);
      }
    } finally {
      startPending(false);
    }
  }

  const liveHref = localizedPathname('/artikel/[slug]', locale as 'id' | 'en', { slug });
  const draftThumb = draftUrl ? (
    <img src={draftUrl} alt="cover draf" className="size-20 rounded-lg border border-line object-cover" loading="lazy" />
  ) : (
    <div className="size-20 rounded-lg border-2 border-dashed border-line bg-surface" aria-label="tanpa cover" />
  );
  const liveThumb = liveUrl ? (
    <img src={liveUrl} alt="cover live" className="size-20 rounded-lg border border-line object-cover" loading="lazy" />
  ) : (
    <div className="size-20 rounded-lg border-2 border-dashed border-line bg-surface" aria-label="tanpa cover" />
  );

  // Banner selalu tampil bila ada artikel publish (termasuk saat sinkron).
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">{t('coverBannerTitle')}</h2>
      <div className="mt-3 flex items-start gap-4">
        <div className="flex flex-col items-center gap-1">
          {liveThumb}
          <span className="text-[10px] text-ink-muted">{publishedLocaleCount > 1 ? `${locale} +${publishedLocaleCount - 1} locale lain` : locale}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          {draftThumb}
          <span className="text-[10px] text-ink-muted">cover draf</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">
            {isSynced
              ? t('coverBannerSynced')
              : liveUrl && draftUrl
                ? t('coverBannerDifferent')
                : !liveUrl && !draftUrl
                  ? t('coverBannerLiveNoCover')
                  : !liveUrl
                    ? t('coverBannerDraftNoCover')
                    : ''}
          </p>
          {!canApply && !isSynced ? (
            <p className="mt-1 text-xs italic text-ink-muted">{t('coverBannerApplyDisabledHint')}</p>
          ) : null}
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
          {done ? (
            <p className="mt-1 text-xs font-medium text-green-700">{t('coverBannerApplied')}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            {done ? (
              <a href={liveHref} className="text-sm text-primary hover:underline">
                {t('coverBannerViewArticle')} →
              </a>
            ) : (
              <button
                type="button"
                onClick={onApply}
                disabled={!canApply || pending}
                className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <CheckCircle className="size-3" aria-hidden />}
                {t('coverBannerApplyBtn')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
