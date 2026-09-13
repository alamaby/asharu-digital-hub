'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, Download, Eye, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { formatDateTime, formatDateTimeSeconds } from '@/lib/utils/format';
import type { StudioGenerationRow, StudioListOptions } from '@/lib/studio/types';
import { retryFailedStudioImage, deleteStudioImage, listUserImages } from '@/lib/studio/actions';

interface OptionLists {
  providers: { id: string; slug: string; display_name: string }[];
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
  styles: { slug: string; display_name: string }[];
  subjects: { slug: string; display_name: string }[];
  cameras: { slug: string; display_name: string }[];
  aspects: { slug: string; display_name: string; width: number; height: number }[];
}

interface Props {
  images: StudioGenerationRow[];
  pollingIntervalSec: number;
  /** Katalog opsi aktif — untuk toolbar filter + label request saat antre. */
  options?: OptionLists | null;
  locale: Locale;
  timeZone: string;
  /**
   * Token dari parent (naik tiap enqueue sukses): picu re-fetch agar baris
   * pending baru tampil di list. Polling otomatis jalan setelahnya.
   * Lewati 0 agar mount awal tidak double-fetch (data RSC sudah ada).
   */
  refreshKey?: number;
  /** Dipanggil saat user menekan "Pakai ulang" — form diisi dari baris ini. */
  onReuse?: (img: StudioGenerationRow) => void;
}

export interface HistoryFilters {
  status: 'all' | 'pending' | 'ready' | 'failed';
  providerId: string;
  modelId: string;
  styleSlug: string;
  subjectSlug: string;
  cameraSlug: string;
  aspectSlug: string;
  sortBy: 'created_at' | 'updated_at';
  dir: 'desc' | 'asc';
}

const DEFAULT_FILTERS: HistoryFilters = {
  status: 'all',
  providerId: '',
  modelId: '',
  styleSlug: '',
  subjectSlug: '',
  cameraSlug: '',
  aspectSlug: '',
  sortBy: 'created_at',
  dir: 'desc'
};

function toListOptions(f: HistoryFilters): StudioListOptions {
  return {
    status: f.status,
    limit: 50,
    sortBy: f.sortBy,
    dir: f.dir,
    providerId: f.providerId || null,
    modelId: f.modelId || null,
    styleSlug: f.styleSlug || null,
    subjectSlug: f.subjectSlug || null,
    cameraSlug: f.cameraSlug || null,
    aspectSlug: f.aspectSlug || null
  };
}

const STATUS_CLASS: Record<string, string> = {
  ready: 'bg-sky-100 text-sky-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800'
};

const selectCls =
  'w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary';

function prettyMeta(meta: Record<string, unknown> | null): string {
  if (!meta) return '—';
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}

export function StudioHistory({ images: initialImages, pollingIntervalSec, options, locale, timeZone, refreshKey = 0, onReuse }: Props) {
  const tHist = useTranslations('studio.history');
  const tNotice = useTranslations('studio.notice');

  const [images, setImages] = useState<StudioGenerationRow[]>(initialImages);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pendingImages = images.filter((i) => i.status === 'pending');
  const filtersActive =
    filters.status !== 'all' ||
    filters.providerId !== '' ||
    filters.modelId !== '' ||
    filters.styleSlug !== '' ||
    filters.subjectSlug !== '' ||
    filters.cameraSlug !== '' ||
    filters.aspectSlug !== '';

  function refresh(next?: HistoryFilters) {
    startTransition(async () => {
      try {
        const refreshed = await listUserImages(toListOptions(next ?? filters));
        setImages(refreshed);
      } catch {
        // polling/refresh gagal diam-diam, coba lagi di tick berikutnya
      }
    });
  }

  // Refresh eksplisit dari parent (enqueue sukses): tampilkan baris pending
  // baru di list dengan filter aktif user. Baris pending yang masuk otomatis
  // mengaktifkan polling di effect bawah.
  useEffect(() => {
    if (refreshKey > 0) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Polling hanya saat ada antrean; filter aktif ikut dibawa.
  useEffect(() => {
    if (pendingImages.length === 0) return;
    let active = true;
    const current = toListOptions(filters);
    const timer = setInterval(() => {
      startTransition((): Promise<void> =>
        (async () => {
          try {
            const refreshed = await listUserImages(current);
            if (active) setImages(refreshed);
          } catch {
            // polling gagal diam-diam, coba lagi di tick berikutnya
          }
        })()
      );
    }, pollingIntervalSec * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImages.length > 0, filters.status, filters.providerId, filters.modelId, filters.styleSlug, filters.subjectSlug, filters.cameraSlug, filters.aspectSlug, filters.sortBy, filters.dir, pollingIntervalSec]);

  function setFilter<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) {
    const next: HistoryFilters = { ...filters, [key]: value };
    // Ganti provider → reset model agar tidak nyangkut di provider lama.
    if (key === 'providerId') next.modelId = '';
    setFilters(next);
    refresh(next);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    refresh(DEFAULT_FILTERS);
  }

  async function download(img: StudioGenerationRow) {
    const url = img.public_url;
    if (!url || downloadingId) return;
    setDownloadingId(img.id);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `studio-${img.id.slice(0, 8)}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice(tNotice('ready'));
    } catch {
      window.open(url, '_blank', 'noreferrer');
    } finally {
      setDownloadingId(null);
    }
  }

  async function copyPrompt(img: StudioGenerationRow) {
    const text = img.image_prompt;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(img.id);
    setTimeout(() => setCopiedId((cur) => (cur === img.id ? null : cur)), 2000);
  }

  async function copyId(img: StudioGenerationRow) {
    try {
      await navigator.clipboard.writeText(img.id);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = img.id;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(`id:${img.id}`);
    setTimeout(() => setCopiedId((cur) => (cur === `id:${img.id}` ? null : cur)), 2000);
  }

  function retry(imgId: string) {
    setRetryingId(imgId);
    setNotice(tNotice('processing'));
    startTransition(async () => {
      try {
        const res = await retryFailedStudioImage(imgId);
        if (!res.ok) {
          setNotice(res.error);
          return;
        }
        refresh();
        setNotice(tNotice('enqueue'));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : tHist('retry'));
      } finally {
        setRetryingId(null);
      }
    });
  }

  function del(img: StudioGenerationRow) {
    setDeletingId(img.id);
    startTransition(async () => {
      try {
        const res = await deleteStudioImage(img.id);
        if (!res.ok) {
          setNotice(res.error);
          return;
        }
        setImages((prev) => prev.filter((i) => i.id !== img.id));
        setNotice(tHist('deleted'));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : tHist('delete'));
      } finally {
        setDeletingId(null);
        setConfirmDeleteId((cur) => (cur === img.id ? null : cur));
      }
    });
  }

  function metaLabel(img: StudioGenerationRow): string {
    // Baris hasil: provider/model aktual. Baris antre (slug '') dengan pin
    // user: yang diminta + "(antre)" agar tidak disangka Auto.
    if (!img.provider_slug && !img.model_slug && img.status === 'pending' && img.model_id && options) {
      const model = options.models.find((m) => m.id === img.model_id);
      if (model) {
        const provider = options.providers.find((p) => p.id === model.provider_id);
        return tHist('metaQueued', {
          provider: provider?.slug ?? model.provider_slug,
          model: model.model_id,
          style: img.style_slug || tHist('noStyle'),
          aspect: img.aspect_slug
        });
      }
    }
    return tHist('meta', {
      provider: img.provider_slug || 'auto',
      model: img.model_slug || 'auto',
      style: img.style_slug || tHist('noStyle'),
      aspect: img.aspect_slug
    });
  }

  const filteredModels = filters.providerId
    ? (options?.models ?? []).filter((m) => m.provider_id === filters.providerId)
    : (options?.models ?? []);
  const hasImages = images.length > 0;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-ink">{tHist('heading')}</h2>

      {/* Toolbar: sort + filter primer, sisanya di "Filter lanjutan". */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs">
          <span className="text-ink-muted">{tHist('filterStatus')}</span>
          <select
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as HistoryFilters['status'])}
            className={selectCls}
          >
            <option value="all">{tHist('all')}</option>
            <option value="pending">{tHist('pending')}</option>
            <option value="ready">{tHist('ready')}</option>
            <option value="failed">{tHist('failed')}</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-ink-muted">{tHist('filterProvider')}</span>
          <select value={filters.providerId} onChange={(e) => setFilter('providerId', e.target.value)} className={selectCls}>
            <option value="">{tHist('all')}</option>
            {(options?.providers ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-ink-muted">{tHist('filterModel')}</span>
          <select value={filters.modelId} onChange={(e) => setFilter('modelId', e.target.value)} className={selectCls}>
            <option value="">{tHist('all')}</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.provider_slug} · {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-ink-muted">{tHist('sortLabel')}</span>
          <select
            value={`${filters.sortBy}:${filters.dir}`}
            onChange={(e) => {
              const [sortBy, dir] = e.target.value.split(':') as [HistoryFilters['sortBy'], HistoryFilters['dir']];
              const next = { ...filters, sortBy, dir };
              setFilters(next);
              refresh(next);
            }}
            className={selectCls}
          >
            <option value="created_at:desc">{tHist('sortNewest')}</option>
            <option value="created_at:asc">{tHist('sortOldest')}</option>
            <option value="updated_at:desc">{tHist('sortUpdatedDesc')}</option>
            <option value="updated_at:asc">{tHist('sortUpdatedAsc')}</option>
          </select>
        </label>
      </div>

      <details className="mt-2 rounded-lg border border-line bg-surface px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-ink">{tHist('advancedFilters')}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs">
            <span className="text-ink-muted">{tHist('filterStyle')}</span>
            <select value={filters.styleSlug} onChange={(e) => setFilter('styleSlug', e.target.value)} className={selectCls}>
              <option value="">{tHist('all')}</option>
              {(options?.styles ?? []).map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-ink-muted">{tHist('filterSubject')}</span>
            <select value={filters.subjectSlug} onChange={(e) => setFilter('subjectSlug', e.target.value)} className={selectCls}>
              <option value="">{tHist('all')}</option>
              {(options?.subjects ?? []).map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-ink-muted">{tHist('filterCamera')}</span>
            <select value={filters.cameraSlug} onChange={(e) => setFilter('cameraSlug', e.target.value)} className={selectCls}>
              <option value="">{tHist('all')}</option>
              {(options?.cameras ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-ink-muted">{tHist('filterAspect')}</span>
            <select value={filters.aspectSlug} onChange={(e) => setFilter('aspectSlug', e.target.value)} className={selectCls}>
              <option value="">{tHist('all')}</option>
              {(options?.aspects ?? []).map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.display_name} ({a.width}×{a.height})
                </option>
              ))}
            </select>
          </label>
        </div>
        {filtersActive ? (
          <button
            type="button"
            onClick={clearFilters}
            disabled={isPending}
            className="mt-2 text-xs text-primary hover:underline disabled:opacity-50"
          >
            {tHist('clearFilters')}
          </button>
        ) : null}
      </details>

      {!hasImages ? (
        <p className="mt-4 text-sm text-ink-muted" role="status">
          {filtersActive ? tHist('noResults') : tHist('empty')}
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {images.map((img, idx) => (
            <li key={img.id} data-testid="studio-row" className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[img.status] ?? 'bg-surface text-ink-muted'}`}
                >
                  {img.status === 'ready' ? tHist('ready') : img.status === 'failed' ? tHist('failed') : tHist('pending')}
                </span>
                {img.reference_public_url ? (
                  <span
                    className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800"
                    title={tHist('referenceLabel')}
                  >
                    {tHist('referenceBadge')}
                  </span>
                ) : null}
                <span className="text-[11px] text-ink-muted">{metaLabel(img)}</span>
                <button
                  type="button"
                  onClick={() => copyId(img)}
                  title={img.id}
                  aria-label={tHist('copyId')}
                  className="inline-flex items-center gap-1 rounded bg-line/20 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted hover:text-primary"
                >
                  {copiedId === `id:${img.id}` ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                  {tHist('idLabel')} {img.id.slice(0, 8)}
                </button>
                <span className="ml-auto text-[11px] tabular-nums text-ink-muted" title={img.created_at}>
                  {formatDateTime(img.created_at, locale, timeZone)}
                </span>
              </div>

              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                {img.public_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.public_url}
                    alt={tHist('imageAlt', { current: idx + 1, total: images.length })}
                    className="w-full max-h-48 rounded object-cover sm:w-40 sm:shrink-0"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded border border-line bg-line/20 sm:w-40 sm:shrink-0">
                    <span className="px-2 text-center text-xs text-ink-muted">
                      {img.status === 'pending'
                        ? tHist('processing')
                        : img.last_error
                        ? tHist('loadError', { error: img.last_error.slice(0, 120) })
                        : tHist('noImage')}
                    </span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink">{tHist('promptLabel')}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-ink">{img.image_prompt}</p>
                  {img.reference_public_url ? (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {tHist('referenceLabel')}:{' '}
                      <a href={img.reference_public_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {tHist('view')}
                      </a>
                    </p>
                  ) : null}
                  {img.negative_prompt ? (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {tHist('negativeLabel')}: {img.negative_prompt}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyPrompt(img)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover"
                    >
                      {copiedId === img.id ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                      {copiedId === img.id ? tHist('copied') : tHist('copy')}
                    </button>
                    {onReuse ? (
                      <button
                        type="button"
                        onClick={() => onReuse(img)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden />
                        {tHist('reuse')}
                      </button>
                    ) : null}
                    {img.public_url && img.status === 'ready' ? (
                      <button
                        type="button"
                        onClick={() => download(img)}
                        disabled={isPending || downloadingId === img.id}
                        aria-busy={downloadingId === img.id}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover disabled:opacity-50"
                      >
                        <Download className="h-3 w-3" aria-hidden />
                        {downloadingId === img.id ? tHist('downloading') : tHist('download')}
                      </button>
                    ) : null}
                    {img.public_url && img.status === 'ready' ? (
                      <a
                        href={img.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover"
                      >
                        <Eye className="h-3 w-3" aria-hidden />
                        {tHist('view')}
                      </a>
                    ) : null}
                    {img.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => retry(img.id)}
                        disabled={isPending || retryingId === img.id}
                        aria-busy={retryingId === img.id}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden />
                        {retryingId === img.id ? tHist('retrying') : tHist('retry')}
                      </button>
                    )}
                    {/* Hapus dua-tahap: klik pertama minta konfirmasi, klik kedua eksekusi. */}
                    {confirmDeleteId === img.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => del(img)}
                      disabled={isPending || deletingId === img.id}
                      aria-busy={deletingId === img.id}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      {deletingId === img.id ? tHist('deleting') : tHist('deleteConfirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={isPending || deletingId === img.id}
                      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-primary disabled:opacity-50"
                    >
                      {tHist('cancelDelete')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(img.id)}
                    disabled={isPending || deletingId === img.id}
                    aria-busy={deletingId === img.id}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    {tHist('delete')}
                  </button>
                )}
                  </div>
                </div>
              </div>

              {/* Detail log: last_error penuh + attempts + llm_meta + timestamp. */}
              <details className="mt-2 rounded-md border border-line/60 bg-background px-2 py-1.5 text-[11px]">
                <summary className="cursor-pointer font-medium text-ink-muted">{tHist('detailLog')}</summary>
                <dl className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-ink-muted">{tHist('createdAt')}</dt>
                    <dd className="tabular-nums text-ink">{formatDateTimeSeconds(img.created_at, locale, timeZone)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-muted">{tHist('updatedAt')}</dt>
                    <dd className="tabular-nums text-ink">{formatDateTimeSeconds(img.updated_at, locale, timeZone)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-muted">{tHist('attempts')}</dt>
                    <dd className="text-ink">{img.attempts}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-muted">{tHist('dimensions')}</dt>
                    <dd className="text-ink">{img.width && img.height ? `${img.width}×${img.height}` : '—'}</dd>
                  </div>
                </dl>
                {img.last_error ? (
                  <div className="mt-1.5">
                    <p className="font-medium text-ink-muted">{tHist('lastError')}</p>
                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-surface p-2 text-red-700">
                      {img.last_error}
                    </pre>
                  </div>
                ) : null}
                <div className="mt-1.5">
                  <p className="font-medium text-ink-muted">{tHist('llmMeta')}</p>
                  <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-surface p-2 text-ink">
                    {prettyMeta(img.llm_meta)}
                  </pre>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}

      {notice ? (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
