'use client';

import { useEffect, useState, useTransition } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { StudioGenerationRow } from '@/lib/studio/types';
import { retryFailedStudioImage, deleteStudioImage, listUserImages } from '@/lib/studio/actions';

interface Props {
  images: StudioGenerationRow[];
  pollingIntervalSec: number;
}

export function StudioHistory({ images: initialImages, pollingIntervalSec }: Props) {
  const tHist = useTranslations('studio.history');
  const tNotice = useTranslations('studio.notice');

  const [images, setImages] = useState<StudioGenerationRow[]>(initialImages);
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start', slidesToScroll: 1, loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const count = images.length;
  const pendingImages = images.filter((i) => i.status === 'pending');

  useEffect(() => {
    if (pendingImages.length === 0) return;
    let active = true;
    const timer = setInterval(() => {
      startTransition((): Promise<void> =>
        (async () => {
          try {
            const refreshed = await listUserImages({ limit: 30 });
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
  }, [pendingImages, pollingIntervalSec]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
  }, [emblaApi]);

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

  function retry(imgId: string) {
    setRetryingId(imgId);
    setNotice(tNotice('processing'));
    startTransition(async () => {
      try {
        await retryFailedStudioImage(imgId);
        const refreshed = await listUserImages({ limit: 30 });
        setImages(refreshed);
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
        await deleteStudioImage(img.id);
        setImages((prev) => prev.filter((i) => i.id !== img.id));
        setNotice(tHist('deleted'));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : tHist('delete'));
      } finally {
        setDeletingId(null);
      }
    });
  }

  function metaLabel(img: StudioGenerationRow): string {
    return tHist('meta', {
      provider: img.provider_slug || 'auto',
      model: img.model_slug || 'auto',
      style: img.style_slug || tHist('noStyle'),
      aspect: img.aspect_slug
    });
  }

  if (count === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-ink">{tHist('heading')}</h2>

      <div role="region" aria-label={tHist('heading')}>
        <div ref={emblaRef} className="overflow-hidden rounded-lg">
          <div className="flex">
            {images.map((img, idx) => {
              const isCurrent = idx === selectedIndex;
              return (
                <div
                  key={img.id}
                  data-testid="studio-slide"
                  className="min-w-0 flex-[0_0_100%]"
                  inert={isCurrent ? undefined : true}
                >
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          img.status === 'ready'
                            ? 'bg-sky-100 text-sky-800'
                            : img.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {img.status === 'ready' ? tHist('ready') : img.status === 'failed' ? tHist('failed') : tHist('pending')}
                      </span>
                      <span className="text-[11px] text-ink-muted">{metaLabel(img)}</span>
                    </div>

                    {img.public_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img.public_url}
                        alt={tHist('imageAlt', { current: idx + 1, total: count })}
                        className="w-full max-h-64 rounded object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center rounded border border-line bg-line/20">
                        <span className="text-xs text-ink-muted">
                          {img.status === 'pending'
                            ? tHist('processing')
                            : img.last_error
                            ? tHist('loadError', { error: img.last_error })
                            : tHist('noImage')}
                        </span>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-ink-muted line-clamp-2 break-words" title={img.image_prompt}>
                      {img.image_prompt}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
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
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H8a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-2"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
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
                      <button
                        type="button"
                        onClick={() => del(img)}
                        disabled={isPending || deletingId === img.id}
                        aria-busy={deletingId === img.id}
                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        {deletingId === img.id ? tHist('deleting') : tHist('delete')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {count > 1 ? (
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              disabled={selectedIndex === 0}
              aria-label={tHist('prevSlide')}
              className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span data-testid="slide-counter" aria-live="polite" className="text-xs tabular-nums text-ink-muted">
              {selectedIndex + 1}/{count}
            </span>
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              disabled={selectedIndex === count - 1}
              aria-label={tHist('nextSlide')}
              className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
