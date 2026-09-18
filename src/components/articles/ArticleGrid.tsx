'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { PublishedArticle } from '@/lib/articles/types';

export interface ArticleGridProps {
  articles: PublishedArticle[];
  locale: 'id' | 'en';
  readMoreLabel: string;
  affiliateBadgeLabel: string;
  readingMinutesLabel: (n: number) => string;
  showSearch?: boolean;
  searchPlaceholder: string;
  sortNewest: string;
  sortOldest: string;
  filterAll: string;
  filterAffiliateOnly: string;
  loadMore: string;
  emptyFiltered: string;
  showingCount: (shown: number, total: number) => string;
  /** i18n-safe category labels keyed by slug; undefined key → key itself. */
  categoryLabels?: Record<string, string>;
}

const PAGE_SIZE = 9;

/** Renders a single ArticleCard (inline so client can re-use same styles). */
function Card({
  a,
  locale,
  readMoreLabel,
  affiliateBadgeLabel,
  readingMinutesLabel,
  featured,
  categoryLabel
}: {
  a: PublishedArticle;
  locale: 'id' | 'en';
  readMoreLabel: string;
  affiliateBadgeLabel: string;
  readingMinutesLabel: (n: number) => string;
  featured?: boolean;
  categoryLabel?: string;
}) {
  const dateStr = a.published_at
    ? new Date(a.published_at).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : null;
  const words = (a.body_md ?? '').trim().split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.ceil(words / 200));
  const cardBorder = featured
    ? 'border-primary/60'
    : 'border-line hover:border-primary';
  const titleClass = featured
    ? 'text-xl sm:text-2xl font-bold'
    : 'text-lg font-semibold';

  return (
    <li className={`overflow-hidden rounded-xl border ${cardBorder} bg-surface shadow-card transition ${featured ? 'col-span-1 lg:col-span-2' : ''}`}>
      <a href={`/id/artikel/${a.slug}`} className="block">
        <div className={`aspect-video w-full overflow-hidden ${featured ? 'lg:h-72' : 'h-48'}`}>
          {a.cover_image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={a.cover_image_url}
              alt={a.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/images/articles/article-placeholder.svg"
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
        <div className="p-5">
          <h2 className={`${titleClass} leading-snug text-ink`}>{a.title}</h2>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{a.excerpt}</p>
          <span className="mt-3 inline-block text-sm font-medium text-primary">{readMoreLabel} →</span>
          <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {dateStr ? <time>{dateStr}</time> : null}
            {dateStr ? <span aria-hidden="true">·</span> : null}
            <span>{readingMinutesLabel(readingMinutes)}</span>
            {categoryLabel ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="rounded-md bg-line px-2 py-0.5 text-xs font-medium text-ink-muted">
                  {categoryLabel}
                </span>
              </>
            ) : null}
            {a.affiliate_url ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {affiliateBadgeLabel}
                </span>
              </>
            ) : null}
          </footer>
        </div>
      </a>
    </li>
  );
}

export function ArticleGrid({
  articles,
  locale,
  readMoreLabel,
  affiliateBadgeLabel,
  readingMinutesLabel,
  showSearch = true,
  searchPlaceholder,
  sortNewest,
  sortOldest,
  filterAll,
  filterAffiliateOnly,
  loadMore,
  emptyFiltered,
  showingCount,
  categoryLabels
}: ArticleGridProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [sort, setSort] = useState<'baru' | 'lama'>(() => (searchParams.get('sort') === 'lama' ? 'lama' : 'baru'));
  const [afiliasi, setAfiliasi] = useState<'semua' | 'ya'>(() => (searchParams.get('afiliasi') === 'ya' ? 'ya' : 'semua'));
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort !== 'baru') params.set('sort', sort);
    if (afiliasi === 'ya') params.set('afiliasi', 'ya');
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [q, sort, afiliasi, pathname, router]);

  const filtered = useMemo(() => {
    let result = articles;
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      result = result.filter((a) =>
        a.title.toLowerCase().includes(term) || a.excerpt.toLowerCase().includes(term)
      );
    }
    if (afiliasi === 'ya') {
      result = result.filter((a) => Boolean(a.affiliate_url));
    }
    return [...result].sort((a, b) => {
      const da = a.published_at ? new Date(a.published_at).getTime() : 0;
      const db = b.published_at ? new Date(b.published_at).getTime() : 0;
      return sort === 'baru' ? db - da : da - db;
    });
  }, [articles, q, sort, afiliasi]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  return (
    <>
      {showSearch ? (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => { setQ(e.target.value); setVisible(PAGE_SIZE); }}
            aria-label={searchPlaceholder}
            className="w-full rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-primary sm:max-w-xs"
          />
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value as 'baru' | 'lama'); setVisible(PAGE_SIZE); }}
              aria-label="Urutkan"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="baru">{sortNewest}</option>
              <option value="lama">{sortOldest}</option>
            </select>
            <button
              type="button"
              onClick={() => { setAfiliasi(afiliasi === 'ya' ? 'semua' : 'ya'); setVisible(PAGE_SIZE); }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                afiliasi === 'ya'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-line bg-surface text-ink-muted hover:border-primary'
              }`}
            >
              {afiliasi === 'ya' ? filterAffiliateOnly : filterAll}
            </button>
          </div>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
        {showingCount(shown.length, articles.length)}
      </p>

      {shown.length === 0 && filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-ink-muted">
          {emptyFiltered}
        </p>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((a, i) => (
                <Card
                  key={a.id}
                  a={a}
                  locale={locale}
                  readMoreLabel={readMoreLabel}
                  affiliateBadgeLabel={affiliateBadgeLabel}
                  readingMinutesLabel={readingMinutesLabel}
                  categoryLabel={a.category ? (categoryLabels?.[a.category] ?? a.category) : undefined}
                  featured={i === 0 && !q && afiliasi === 'semua' && sort === 'baru'}
                />
            ))}
          </ul>
          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="rounded-lg border border-line bg-surface px-6 py-2 text-sm font-medium text-ink hover:border-primary hover:text-primary transition"
              >
                {loadMore}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
