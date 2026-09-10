'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link as I18nLink, usePathname, useRouter } from '@/i18n/navigation';
import NextLink from 'next/link';
import { formatDateTime } from '@/lib/utils/format';

interface DraftItem {
  id: string;
  status: string;
  created_at: string;
  platform_slug?: string | null;
  research_topic_id?: string | null;
  generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  affiliate_injections: { friendly_code: string; product_name_id?: string; product_image?: string; match_score?: number }[];
  llm_meta?: { provider: string; model: string; platform?: string };
}

interface Props {
  drafts: DraftItem[];
  topicSessionMap: Record<string, string>;
  platforms: { slug: string; display_name: string }[];
  filters: { status: string[]; provider: string[]; platform: string[]; date: string; sort: string };
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  locale: string;
  timeZone: string;
  error: string | null;
}

const STATUS_OPTIONS = ['needs_review', 'approved', 'rejected'];
const PROVIDER_OPTIONS = ['naraya', 'openrouter', 'gemini', 'cloudflare'];

function MultiSelect({
  label,
  allLabel,
  countHint,
  options,
  selected,
  onChange
}: {
  label: string;
  allLabel: string;
  countHint: (count: number) => string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      <span className="uppercase tracking-wide">{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full rounded-lg border border-line bg-background px-2 py-2 text-left text-sm font-normal text-ink focus:border-primary focus:outline-none"
        >
          {selected.length === 0 ? allLabel : countHint(selected.length)}
        </button>
        {open ? (
          <div className="absolute z-10 mt-1 max-h-56 w-56 overflow-auto rounded-lg border border-line bg-surface p-2 shadow-card">
            <div className="flex gap-2 pb-2">
              <button
                type="button"
                onClick={() => onChange(options.map((o) => o.value))}
                className="rounded border border-line px-2 py-0.5 text-xs text-ink hover:border-primary"
              >
                Pilih semua
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded border border-line px-2 py-0.5 text-xs text-ink hover:border-primary"
              >
                Hapus
              </button>
            </div>
            {options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-normal text-ink hover:bg-background">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() =>
                    onChange(selected.includes(o.value) ? selected.filter((s) => s !== o.value) : [...selected, o.value])
                  }
                  className="size-4 accent-[var(--color-primary)]"
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ReviewListClient({ drafts, topicSessionMap, platforms, filters, page, totalPages, totalCount, locale, timeZone, error }: Props) {
  const t = useTranslations('content.review');
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selStatus, setSelStatus] = useState<string[]>(filters.status);
  const [selProvider, setSelProvider] = useState<string[]>(filters.provider);
  const [selPlatform, setSelPlatform] = useState<string[]>(filters.platform);

  // Sinkronkan checkbox saat filter terapan berubah via navigasi (Reset/back).
  useEffect(() => {
    setSelStatus(filters.status);
  }, [filters.status]);
  useEffect(() => {
    setSelProvider(filters.provider);
  }, [filters.provider]);
  useEffect(() => {
    setSelPlatform(filters.platform);
  }, [filters.platform]);

  function queryObject(): Record<string, string> {
    const o: Record<string, string> = {};
    if (selStatus.length > 0) o.status = selStatus.join(',');
    if (selProvider.length > 0) o.provider = selProvider.join(',');
    if (selPlatform.length > 0) o.platform = selPlatform.join(',');
    if (filters.date !== 'all') o.date = filters.date;
    if (filters.sort !== 'newest') o.sort = filters.sort;
    return o;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    if (selStatus.length > 0) params.set('status', selStatus.join(','));
    if (selProvider.length > 0) params.set('provider', selProvider.join(','));
    if (selPlatform.length > 0) params.set('platform', selPlatform.join(','));
    const date = String(fd.get('date') ?? 'all');
    const sort = String(fd.get('sort') ?? 'newest');
    if (date !== 'all') params.set('date', date);
    if (sort !== 'newest') params.set('sort', sort);
    const qs = params.toString();
    startTransition(() => router.push((qs ? `${pathname}?${qs}` : pathname) as never));
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MultiSelect
            label="Status"
            allLabel="Semua status"
            countHint={(c) => `${c} status dipilih`}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
            selected={selStatus}
            onChange={setSelStatus}
          />
          <MultiSelect
            label="Provider"
            allLabel="Semua provider"
            countHint={(c) => `${c} provider dipilih`}
            options={PROVIDER_OPTIONS.map((p) => ({ value: p, label: p }))}
            selected={selProvider}
            onChange={setSelProvider}
          />
          <MultiSelect
            label="Platform"
            allLabel="Semua platform"
            countHint={(c) => `${c} platform dipilih`}
            options={platforms.map((p) => ({ value: p.slug, label: p.display_name }))}
            selected={selPlatform}
            onChange={setSelPlatform}
          />
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
            const sessionId = (d.research_topic_id && topicSessionMap[d.research_topic_id]) || null;
            const platform = d.platform_slug ?? d.llm_meta?.platform ?? 'all';
  return (
              <div key={d.id}>
                <NextLink
                  href={`/${locale}/konten/review/${d.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full border bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{d.status}</span>
                      <span className="inline-flex items-center rounded-full border border-line bg-background px-2 py-0.5 text-xs font-medium text-ink-muted" title="Target platform draf">
                        {platform}
                      </span>
                    </span>
                    <span className="text-xs text-ink-muted">{formatDateTime(d.created_at, locale as never, timeZone)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-ink">{snippet}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                    {inj ? <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">ASH-{inj.friendly_code.replace('ASH-', '')}</span> : null}
                    {d.llm_meta ? <span>{d.llm_meta.provider} · {d.llm_meta.model}</span> : null}
                  </div>
                </NextLink>
                {sessionId ? (
                  <div className="mt-1 text-right">
                    <I18nLink
                      href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId } }}
                      className="text-xs text-primary hover:underline"
                    >
                      {t('researchLink')} →
                    </I18nLink>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <nav aria-label="pagination" className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">Hal {page} dari {totalPages}</span>
        <div className="flex gap-2">
          <I18nLink href={{ pathname: '/konten/review', query: { ...queryObject(), page: String(page - 1) } }} className={`rounded-lg border px-3 py-1 text-sm ${page <= 1 ? 'pointer-events-none opacity-40' : 'border-line hover:border-primary'}`}>Prev</I18nLink>
          <I18nLink href={{ pathname: '/konten/review', query: { ...queryObject(), page: String(page + 1) } }} className={`rounded-lg border px-3 py-1 text-sm ${page >= totalPages ? 'pointer-events-none opacity-40' : 'border-line hover:border-primary'}`}>Next</I18nLink>
        </div>
      </nav>
    </div>
  );
}
