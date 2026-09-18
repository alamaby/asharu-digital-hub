import { Link } from '@/i18n/navigation';
import type { ArticleLocale } from '@/lib/articles/types';

export interface ArticleCardProps {
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  publishedAt: string | null;
  locale: ArticleLocale;
  readingMinutes: number;
  hasAffiliate: boolean;
  featured?: boolean;
  categoryLabel?: string;
  readMoreLabel: string;
  affiliateBadgeLabel: string;
  readingMinutesLabel: (n: number) => string;
}

const PLACEHOLDER_URL = '/images/articles/article-placeholder.svg';

/** Server Component — tanpa hook/onError agar tetap RSC (mencegah digest 1391377559). */
export function ArticleCard({
  slug,
  title,
  excerpt,
  coverUrl,
  publishedAt,
  locale,
  readingMinutes,
  hasAffiliate,
  featured,
  categoryLabel,
  readMoreLabel,
  affiliateBadgeLabel,
  readingMinutesLabel
}: ArticleCardProps) {
  const dateStr = publishedAt
    ? new Date(publishedAt).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : null;

  // next-intl Link accepts typed pathnames; cast as never to work around
  // the exhaustive-union inference when the pathname is constructed dynamically.
  const href = { pathname: '/artikel/[slug]' as const, params: { slug } };
  const cardBorder = featured
    ? 'border-primary/60'
    : 'border-line hover:border-primary';
  const titleClass = featured
    ? 'text-xl sm:text-2xl font-bold'
    : 'text-lg font-semibold';

  return (
    <li className={`overflow-hidden rounded-xl border ${cardBorder} bg-surface shadow-card transition ${featured ? 'col-span-1 lg:col-span-2' : ''}`}>
      <Link href={href as never} className="block">
        <div className={`aspect-video w-full overflow-hidden ${featured ? 'lg:h-72' : 'h-48'}`}>
          {coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverUrl}
              alt={title}
              className="h-full w-full object-cover"
              loading={featured ? 'eager' : 'lazy'}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={PLACEHOLDER_URL}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
        <div className="p-5">
          <h2 className={`${titleClass} leading-snug text-ink`}>
            {title}
          </h2>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">
            {excerpt}
          </p>
          <span className="mt-3 inline-block text-sm font-medium text-primary">
            {readMoreLabel} →
          </span>
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
            {hasAffiliate ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {affiliateBadgeLabel}
                </span>
              </>
            ) : null}
          </footer>
        </div>
      </Link>
    </li>
  );
}
