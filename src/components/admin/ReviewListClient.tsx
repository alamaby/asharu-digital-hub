'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link as I18nLink, usePathname, useRouter } from '@/i18n/navigation';
import NextLink from 'next/link';

interface Props {
  drafts: Array<{ id: string; status: string; created_at: string; generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] }; affiliate_injections: { friendly_code: string; product_name_id?: string; product_image?: string; match_score?: number }[]; llm_meta?: { provider: string; model: string } }>;
  platforms: { slug: string; display_name: string }[];
  filters: { status: string; provider: string; platform: string; date: string; sort: string; page: number };
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  locale: string;
  error: string | null;
}

export function ReviewListClient({ drafts, platforms, filters, page, totalPages, totalCount, locale, error }: Props) {
  const t = useTranslations('content.review');
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const status = String(fd.get('status') ?? 'all');
    const provider = String(fd.get('provider') ?? 'all');
    const platform = String(fd.get('platform') ?? 'all');
    const date = String(fd.get('date') ?? 'all');
    const sort = String(fd.get('sort') ?? 'newest');
    if (status !== 'all') params.set('status', status);
    if (provider !== 'all') params.set('provider', provider);
    if (platform !== 'all') params.set('platform', platform);
    if (date !== 'all') params.set('date', date);
    if (sort !== 'newest') params.set('sort', sort);
    const qs = params.toString();
    startTransition(() => router.push((qs ? `${pathname}?${qs}` : pathname) as never));
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-ink-muted">
            Status
            <select name="status" defaultValue={filters.status} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="all">Semua status</option>
              <option value="needs_review">needs_review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Provider
            <select name="provider" defaultValue={filters.provider} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="all">Semua provider</option>
              <option value="naraya">naraya</option>
              <option value="openrouter">openrouter</option>
              <option value="gemini">gemini</option>
              <option value="cloudflare">cloudflare</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Platform
            <select name="platform" defaultValue={filters.platform} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="all">Semua platform</option>
              {platforms.map((p) => (
                <option key={p.slug} value={p.slug}>{p.display_name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-muted">
            Periode
            <select name="date" defaultValue={filters.date} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="all">Semua waktu</option>
              <option value="7d">7 hari</option>
              <option value="30d">30 hari</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Urutan
            <select name="sort" defaultValue={filters.sort} className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 text-sm">
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{isPending ? 'Memuat…' : 'Terapkan'}</button>
          <I18nLink href={{ pathname: '/konten/review' }} className="rounded-lg border border-line px-4 py-2 text-sm">Reset</I18nLink>
          <span className="ml-auto text-xs text-ink-muted">{totalCount} total · hal {page}/{totalPages}</span>
        </div>
      </form>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Query error: {error}</p> : null}

      <div className="space-y-3">
        {drafts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center text-sm text-ink-muted">{t('empty')}</p>
        ) : (
          drafts.map((d) => {
            const snippet = d.generated_thread.main.id.slice(0, 120);
            const inj = d.affiliate_injections[0];
            return (
              <NextLink
                key={d.id}
                href={`/${locale}/konten/review/${d.id}`}
                className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-full border bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{d.status}</span>
                  <span className="text-xs text-ink-muted">{new Date(d.created_at).toLocaleString(locale)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink">{snippet}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                  {inj ? <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">ASH-{inj.friendly_code.replace('ASH-', '')}</span> : null}
                  {d.llm_meta ? <span>{d.llm_meta.provider} · {d.llm_meta.model}</span> : null}
                </div>
              </NextLink>
            );
          })
        )}
      </div>

      <nav aria-label="pagination" className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">Hal {page} dari {totalPages}</span>
        <div className="flex gap-2">
          <I18nLink href={{ pathname: '/konten/review', query: { ...filters, page: String(page - 1) } }} className={`rounded-lg border px-3 py-1 text-sm ${page <= 1 ? 'pointer-events-none opacity-40' : 'border-line hover:border-primary'}`}>Prev</I18nLink>
          <I18nLink href={{ pathname: '/konten/review', query: { ...filters, page: String(page + 1) } }} className={`rounded-lg border px-3 py-1 text-sm ${page >= totalPages ? 'pointer-events-none opacity-40' : 'border-line hover:border-primary'}`}>Next</I18nLink>
        </div>
      </nav>
    </div>
  );
}
