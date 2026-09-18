'use client';

import { useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { AdminBadge } from '@/components/admin/shell/AdminBadge';
import { ActionNoticeView, type ActionNotice } from '@/components/admin/llm/ActionFeedback';
import { setProductFeatured } from '@/lib/admin/affiliate-actions';
import { pageRange, type ProdukFilter } from '@/lib/admin/produk-query';

interface ProductRow {
  id: string;
  friendly_code: string;
  name_id: string;
  merchant: string;
  category: string;
  image: string | null;
  url: string | null;
  is_featured: boolean;
  featured_override: boolean | null;
  featured_override_at: string | null;
  created_at: string;
}

interface FeaturedProductBoardProps {
  items: ProductRow[];
  curatedCount: number;
  page: number;
  totalPages: number;
  totalCount: number;
  q: string;
  filter: ProdukFilter;
}

function stateLabel(override: boolean | null, isFeatured: boolean) {
  if (override === true) return 'pinned';
  if (override === false) return 'excluded';
  return isFeatured ? 'auto' : 'other';
}

function stateBadge(label: string) {
  switch (label) {
    case 'pinned': return <AdminBadge color="success">Featured</AdminBadge>;
    case 'excluded': return <AdminBadge color="error">Dikeluarkan</AdminBadge>;
    default: return <AdminBadge color="neutral">Auto</AdminBadge>;
  }
}

export function FeaturedProductBoard({
  items,
  curatedCount,
  page,
  totalPages,
  totalCount,
  q,
  filter
}: FeaturedProductBoardProps) {
  const t = useTranslations('admin.produk');
  const router = useRouter();
  const pathname = usePathname();
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAction(id: string, mode: 'pin' | 'auto' | 'exclude') {
    setBusyId(id);
    setNotice({ type: 'working', message: t('saving') });
    try {
      const result = await setProductFeatured(id, mode);
      if (!result.ok) {
        setNotice({ type: 'error', message: result.error ?? t('errorGeneric') });
      } else {
        const msg = mode === 'pin'
          ? (result.released ? t('noticeSwapped', { code: result.released }) : t('noticePinned'))
          : mode === 'exclude' ? t('noticeExcluded') : t('noticeAuto');
        setNotice({ type: 'success', message: msg, detail: result.released ? `swap:${result.released}` : undefined });
        router.refresh();
      }
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : t('errorGeneric') });
    } finally {
      setBusyId(null);
    }
  }

  // Bangun query string baseline dari props (q + filter), gunakan untuk navigasi halaman.
  const baseQuery = new URLSearchParams();
  if (q) baseQuery.set('q', q);
  if (filter !== 'all') baseQuery.set('filter', filter);
  const queryString = baseQuery.toString();
  const basePath = queryString ? `${pathname}?${queryString}` : pathname;

  const { from, to } = pageRange(page);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-muted" aria-live="polite">
          {t('curatedCount', { n: curatedCount })}
        </span>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-ink"
          />
          <select
            name="filter"
            defaultValue={filter}
            aria-label={t('filterAll')}
            className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-ink"
          >
            <option value="all">{t('filterAll')}</option>
            <option value="pinned">{t('filterPinned')}</option>
            <option value="auto">{t('filterAuto')}</option>
            <option value="excluded">{t('filterExcluded')}</option>
          </select>
          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
            {t('applyFilter')}
          </button>
          {q || filter !== 'all' ? (
            <a href={basePath} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:border-primary">
              {t('resetFilter')}
            </a>
          ) : null}
        </form>
      </div>

      <p role="status" aria-live="polite" className="mb-3 text-xs text-ink-muted">
        {t('rangeInfo', { from: from + 1, to: Math.min(to + 1, totalCount), count: totalCount })}
      </p>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const label = stateLabel(r.featured_override, r.is_featured);
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.image}
                      alt={r.name_id}
                      width={48}
                      height={48}
                      loading="lazy"
                      className="size-12 shrink-0 rounded-lg border border-line object-cover"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.dataset.fallback === 'true') return;
                        img.dataset.fallback = 'true';
                        img.src = '/images/products/product-placeholder-1.svg';
                      }}
                    />
                  ) : (
                    <div className="size-12 shrink-0 rounded-lg border border-line bg-background" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{r.name_id}</p>
                    <p className="text-xs text-ink-muted">
                      ASH-{r.friendly_code.replace('ASH-', '')} · {r.category} · {r.merchant}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {stateBadge(label)}
                  {label === 'pinned' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'auto')}
                        aria-busy={busy}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            {t('saving')}
                          </span>
                        ) : t('actionAuto')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'exclude')}
                        aria-busy={busy}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            {t('saving')}
                          </span>
                        ) : t('actionExclude')}
                      </button>
                    </>
                  ) : label === 'auto' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'pin')}
                        aria-busy={busy}
                        className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            {t('saving')}
                          </span>
                        ) : t('actionPin')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'exclude')}
                        aria-busy={busy}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            {t('saving')}
                          </span>
                        ) : t('actionExclude')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'pin')}
                        aria-busy={busy}
                        className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            {t('saving')}
                          </span>
                        ) : t('actionPin')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'auto')}
                        aria-busy={busy}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                              <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            {t('saving')}
                          </span>
                        ) : t('actionAuto')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <nav aria-label={t('paginationLabel')} className="mt-4 flex items-center justify-between text-sm">
        <span className="text-ink-muted">{t('pageOf', { page, total: totalPages })}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <a
              href={`${basePath}${basePath.includes('?') ? '&' : '?'}page=${page - 1}`}
              className="rounded-lg border border-line px-3 py-1.5 text-ink hover:border-primary"
            >
              {t('pagePrev')}
            </a>
          ) : null}
          {page < totalPages ? (
            <a
              href={`${basePath}${basePath.includes('?') ? '&' : '?'}page=${page + 1}`}
              className="rounded-lg border border-line px-3 py-1.5 text-ink hover:border-primary"
            >
              {t('pageNext')}
            </a>
          ) : null}
        </div>
      </nav>

      {notice ? <div className="mt-4"><ActionNoticeView notice={notice} /></div> : null}
    </div>
  );
}
