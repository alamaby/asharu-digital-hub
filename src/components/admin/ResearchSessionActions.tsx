'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  shortlistTopics,
  rejectTopics,
  advanceToDevelopment
} from '@/lib/content/actions';
import { Link } from '@/i18n/navigation';

interface TopicItem {
  id: string;
  rank: number | null;
  topic: string;
  category: string | null;
  final_score: number | null;
  verification_status: string;
  status: string;
}

type AffiliateBand = 'high' | 'medium' | 'low' | 'none';

interface AffiliatePreview {
  matched: boolean;
  bestScore: number;
  band: AffiliateBand;
}

interface Props {
  sessionId: string;
  topics: TopicItem[];
  affiliatePreviews?: Record<string, AffiliatePreview> | null;
}

const BAND_LABEL: Record<AffiliateBand, { id: string; en: string }> = {
  high: { id: 'Produk cocok', en: 'Product matches' },
  medium: { id: 'Produk kurang cocok', en: 'Product weak match' },
  low: { id: 'Produk tidak cocok', en: 'Product mismatch' },
  none: { id: 'Tanpa produk', en: 'No product' }
};
const BAND_CLASS: Record<AffiliateBand, string> = {
  high: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-red-50 text-red-800 border-red-200',
  none: 'bg-red-50 text-red-800 border-red-200'
};

export function ResearchSessionActions({ sessionId, topics, affiliatePreviews }: Props) {
  const t = useTranslations('admin.research');
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'shortlist' | 'reject' | 'advance' | null>(null);
  const [notice, setNotice] = useState<
    | { kind: 'working' | 'success'; action: 'shortlist' | 'reject' | 'advance'; count?: number }
    | null
  >(null);
  const [error, setError] = useState<{ message: string; technical?: string } | null>(null);
  const [, startTransition] = useTransition();

  const shortlistedCount = topics.filter((tp) => tp.status === 'shortlisted').length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function friendlyError(raw: string): { message: string; technical?: string } {
    if (/no shortlisted topics/i.test(raw)) {
      return { message: t('statusErrorNoShortlist'), technical: raw };
    }
    if (/not in awaiting_selection|not failed|retryable/i.test(raw)) {
      return { message: t('statusErrorStaleState'), technical: raw };
    }
    return { message: t('statusErrorDefault'), technical: raw };
  }

  async function onShortlist() {
    if (selected.size === 0) return;
    const n = selected.size;
    setBusy('shortlist');
    setError(null);
    setNotice({ kind: 'working', action: 'shortlist', count: n });
    const result = await shortlistTopics(sessionId, Array.from(selected));
    setBusy(null);
    if (!result.success) {
      setNotice(null);
      setError(friendlyError(result.error ?? 'failed'));
    } else {
      setSelected(new Set());
      setNotice({ kind: 'success', action: 'shortlist', count: n });
      startTransition(() => router.refresh());
    }
  }

  async function onReject() {
    if (selected.size === 0) return;
    const n = selected.size;
    setBusy('reject');
    setError(null);
    setNotice({ kind: 'working', action: 'reject', count: n });
    const result = await rejectTopics(sessionId, Array.from(selected));
    setBusy(null);
    if (!result.success) {
      setNotice(null);
      setError(friendlyError(result.error ?? 'failed'));
    } else {
      setSelected(new Set());
      setNotice({ kind: 'success', action: 'reject', count: n });
      startTransition(() => router.refresh());
    }
  }

  async function onAdvance() {
    setBusy('advance');
    setError(null);
    setNotice({ kind: 'working', action: 'advance' });
    const result = await advanceToDevelopment(sessionId);
    setBusy(null);
    if (!result.success) {
      setNotice(null);
      setError(friendlyError(result.error ?? 'failed'));
    } else {
      setNotice({ kind: 'success', action: 'advance' });
      startTransition(() => router.refresh());
    }
  }

  return (
    <section className="mt-8 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{t('shortlistHeading')}</h2>
        <p className="text-xs text-ink-muted">
          {t('shortlistCount', { count: shortlistedCount })}
        </p>
      </div>
      <p className="text-sm text-ink-muted">{t('shortlistIntro')}</p>

      {(() => {
        const unmatched = affiliatePreviews
          ? topics.filter((tp) => {
              const pv = affiliatePreviews[tp.id];
              return pv && !pv.matched;
            })
          : [];
        if (unmatched.length === 0) return null;
        const productCategories = new Set<string>();
        for (const tp of unmatched) {
          if (tp.category) productCategories.add(tp.category);
        }
        return (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
            <p className="font-medium">{t('affiliateMismatchHeading', { count: unmatched.length })}</p>
            <p className="mt-1 text-amber-700">{t('affiliateMismatchBody')}</p>
            {productCategories.size > 0 ? (
              <p className="mt-1 text-amber-700">
                {t('affiliateMismatchCategories')}: {Array.from(productCategories).join(', ')}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-amber-600">{t('affiliateMismatchFallbackNote', { score: Math.max(...unmatched.map((tp) => affiliatePreviews?.[tp.id]?.bestScore ?? 0)) })}</p>
            <Link href="/admin" className="mt-1 inline-block font-medium text-amber-900 underline">
              {t('affiliateMismatchAction')} →
            </Link>
          </div>
        );
      })()}

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            notice.kind === 'working' ? 'bg-blue-50 text-blue-900' : 'bg-emerald-50 text-emerald-900'
          }`}
        >
          {notice.kind === 'working' ? (
            <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 animate-spin" aria-hidden>
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <span aria-hidden className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">✓</span>
          )}
          {notice.kind === 'working'
            ? notice.action === 'advance'
              ? t('statusWorkingAdvance')
              : notice.action === 'shortlist'
                ? t('statusWorkingShortlist', { count: notice.count ?? 0 })
                : t('statusWorkingReject', { count: notice.count ?? 0 })
            : notice.action === 'advance'
              ? t('statusSuccessAdvance')
              : notice.action === 'shortlist'
                ? t('statusSuccessShortlist', { count: notice.count ?? 0 })
                : t('statusSuccessReject', { count: notice.count ?? 0 })}
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>{error.message}</p>
          {error.technical ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-red-700 underline">{t('statusTechDetails')}</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-red-100/60 p-2 text-xs">{error.technical.slice(0, 1000)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-2">
        {topics.map((tp) => {
          const pv = affiliatePreviews?.[tp.id];
          const band: AffiliateBand | null = pv ? pv.band : null;
          return (
            <li key={tp.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-3">
              <input
                id={`topic-${tp.id}`}
                type="checkbox"
                checked={selected.has(tp.id) || tp.status === 'shortlisted'}
                onChange={() => toggle(tp.id)}
                disabled={busy !== null}
                className="size-4 rounded border-line text-primary focus:ring-2 focus:ring-primary/20"
              />
              <label htmlFor={`topic-${tp.id}`} className="flex-1 cursor-pointer">
                <p className="text-sm font-medium text-ink">
                  #{tp.rank ?? '-'} · {tp.topic}
                </p>
                <p className="text-xs text-ink-muted">
                  {tp.category ?? '-'} · score {tp.final_score?.toFixed(1) ?? '-'} · {tp.status}
                </p>
              </label>
              {band ? (
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${BAND_CLASS[band]}`} title={`match score ${pv?.bestScore ?? 0}`}>
                  {BAND_LABEL[band].id}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShortlist}
          disabled={selected.size === 0 || busy !== null}
          aria-busy={busy === 'shortlist'}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy === 'shortlist' ? (
            <svg viewBox="0 0 20 20" fill="none" className="size-4 animate-spin" aria-hidden>
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : null}
          {t('shortlistAction')}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={selected.size === 0 || busy !== null}
          aria-busy={busy === 'reject'}
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy === 'reject' ? (
            <svg viewBox="0 0 20 20" fill="none" className="size-4 animate-spin" aria-hidden>
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : null}
          {t('rejectAction')}
        </button>
        <button
          type="button"
          onClick={onAdvance}
          disabled={shortlistedCount === 0 || busy !== null}
          aria-busy={busy === 'advance'}
          className="ml-auto flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'advance' ? (
            <svg viewBox="0 0 20 20" fill="none" className="size-4 animate-spin" aria-hidden>
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : null}
          {t('advanceAction')}
        </button>
      </div>
    </section>
  );
}
