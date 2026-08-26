'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { GalleryPhoto } from '@/data/schemas';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';

interface PropertyGalleryProps {
  photos: GalleryPhoto[];
}

/**
 * Photo grid + keyboard-accessible lightbox (Esc closes, arrows navigate,
 * focus moves to the close button while open).
 */
export function PropertyGallery({ photos }: PropertyGalleryProps) {
  const t = useTranslations('property');
  const [active, setActive] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setActive(null), []);
  const step = useCallback(
    (delta: 1 | -1) =>
      setActive((current) =>
        current === null
          ? current
          : (current + delta + photos.length) % photos.length
      ),
    [photos.length]
  );

  useEffect(() => {
    if (active === null) return;
    closeRef.current?.focus();
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [active, close, step]);

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <li key={photo.src}>
            <button
              type="button"
              onClick={() => setActive(index)}
              aria-label={photo.alt.id}
              className="block w-full overflow-hidden rounded-lg border border-line bg-background transition-colors hover:border-primary"
            >
              <span className="relative block aspect-[4/3]">
                <ResponsiveImage
                  src={photo.src}
                  alt={photo.alt.id}
                  width={photo.width}
                  height={photo.height}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {active !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('galleryHeading')}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ink/90 p-4"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={t('lightboxClose')}
            className="absolute right-4 top-4 flex min-h-touch min-w-touch items-center justify-center rounded-lg bg-surface/10 text-white hover:bg-surface/20"
          >
            <X className="size-6" aria-hidden />
          </button>

          <ResponsiveImage
            key={photos[active]!.src}
            src={photos[active]!.src}
            alt={photos[active]!.alt.id}
            width={photos[active]!.width}
            height={photos[active]!.height}
            priority
            className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
          />

          <p className="text-sm text-surface/80" aria-live="polite">
            {(active ?? 0) + 1} / {photos.length} — {photos[active]!.alt.id}
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t('lightboxPrev')}
              className="flex min-h-touch min-w-touch items-center justify-center rounded-lg bg-surface/10 text-white hover:bg-surface/20"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t('lightboxNext')}
              className="flex min-h-touch min-w-touch items-center justify-center rounded-lg bg-surface/10 text-white hover:bg-surface/20"
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
