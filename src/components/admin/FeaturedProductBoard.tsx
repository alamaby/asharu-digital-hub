'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { AdminBadge } from '@/components/admin/shell/AdminBadge';
import { ActionNoticeView, type ActionNotice } from '@/components/admin/llm/ActionFeedback';
import { setProductFeatured } from '@/lib/admin/affiliate-actions';

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

type FilterMode = 'all' | 'pinned' | 'auto' | 'excluded';

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
  curatedCount
}: {
  items: ProductRow[];
  curatedCount: number;
}) {
  const t = useTranslations('admin.produk');
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = items.filter((r) => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${r.name_id} ${r.friendly_code} ${r.merchant}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filter === 'pinned') return r.featured_override === true;
    if (filter === 'auto') return r.featured_override === null && r.is_featured;
    if (filter === 'excluded') return r.featured_override === false;
    return true;
  });

  async function handleAction(id: string, mode: 'pin' | 'auto' | 'exclude') {
    setBusyId(id);
    setNotice({ type: 'working', message: 'Menyimpan...' });
    try {
      const result = await setProductFeatured(id, mode);
      if (!result.ok) {
        setNotice({ type: 'error', message: result.error ?? t('errorGeneric') });
      } else {
        const msg = mode === 'pin'
          ? (result.released ? t('noticeSwapped', { code: result.released }) : t('noticePinned'))
          : mode === 'exclude' ? t('noticeExcluded') : t('noticeAuto');
        setNotice({ type: 'success', message: msg });
        router.refresh();
      }
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : t('errorGeneric') });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-muted">{t('curatedCount', { n: curatedCount })}</span>
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-ink"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-ink"
        >
          <option value="all">{t('filterAll')}</option>
          <option value="pinned">{t('filterPinned')}</option>
          <option value="auto">{t('filterAuto')}</option>
          <option value="excluded">{t('filterExcluded')}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
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
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('actionAuto')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'exclude')}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('actionExclude')}
                      </button>
                    </>
                  ) : label === 'auto' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'pin')}
                        className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('actionPin')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'exclude')}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('actionExclude')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'pin')}
                        className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('actionPin')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(r.id, 'auto')}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('actionAuto')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notice ? <div className="mt-4"><ActionNoticeView notice={notice} /></div> : null}
    </div>
  );
}
