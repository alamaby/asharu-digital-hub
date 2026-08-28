'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AffiliateProduct } from '@/data/schemas';
import { ProductCard } from './ProductCard';

const AUTO_ADVANCE_MS = 10_000;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const RAF_THROTTLE_MS = 50;

type FrameHandle = number | ReturnType<typeof globalThis.setTimeout>;

function requestFrame(callback: FrameRequestCallback): FrameHandle {
  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
    return window.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(
    () => callback(performance.now()),
    RAF_THROTTLE_MS
  );
}

function cancelFrame(handle: FrameHandle): void {
  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
    window.cancelAnimationFrame(handle as number);
    return;
  }
  globalThis.clearTimeout(handle);
}

interface ProductCarouselProps {
  products: AffiliateProduct[];
  linkPosition: string;
}

/**
 * Single-card affiliate product carousel with auto-advance every 10 seconds.
 * Meets WCAG 2.2.2 (pause, stop, hide): auto-play pauses on hover/focus and via
 * a visible play/pause toggle, and is disabled entirely under
 * `prefers-reduced-motion`. Slides stay in the DOM (stacked via the CSS track)
 * so search/SEO and JSON-LD are unaffected.
 */
export function ProductCarousel({ products, linkPosition }: ProductCarouselProps) {
  const t = useTranslations('product.carousel');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const reducedRef = useRef(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  const count = products.length;
  const hasMultiple = count > 1;

  // Keep the reduced-motion preference in a ref (read inside the animation loop).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    reducedRef.current = media.matches;
    const onChange = (event: MediaQueryListEvent) => {
      reducedRef.current = event.matches;
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Smooth countdown via requestAnimationFrame. Reset to a fresh slide only
  // happens imperatively in `goTo` / at the moment the countdown wraps, so
  // pausing here simply freezes `elapsedRef` and resumes from the same value.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasMultiple || paused || reducedRef.current) return;

    const start = performance.now();
    startRef.current = start;

    let frame: FrameHandle = 0;
    let lastPainted = -1;
    const tick = (now: number) => {
      const elapsed = elapsedRef.current + (now - startRef.current);
      const pct = Math.min(100, (elapsed / AUTO_ADVANCE_MS) * 100);
      if (pct - lastPainted >= 1 || pct === 100) {
        lastPainted = pct;
        setProgress(pct);
      }
      if (pct >= 100) {
        elapsedRef.current = 0;
        startRef.current = now;
        lastPainted = -1;
        setProgress(0);
        setIndex((current) => (current + 1) % count);
      }
      frame = requestFrame(tick);
    };
    frame = requestFrame(tick);

    return () => {
      cancelFrame(frame);
      // Carry elapsed time forward so a pause/resume continues from the same point.
      elapsedRef.current += performance.now() - startRef.current;
    };
  }, [hasMultiple, paused, count]);

  const goTo = useCallback(
    (next: number) => {
      // Manual navigation restarts the countdown for the newly shown slide.
      setProgress(0);
      startRef.current = performance.now();
      elapsedRef.current = 0;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );
  const step = useCallback((delta: 1 | -1) => goTo(index + delta), [goTo, index]);

  // Pause when a descendant gains focus; resume only once focus actually
  // leaves the region (relatedTarget outside), using capture-phase handlers.
  const resumeIfFocusLeft = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const related = event.relatedTarget as Node | null;
      const stillInside = related !== null && regionRef.current?.contains(related);
      if (!stillInside) setPaused(false);
    },
    []
  );

  if (count === 0) return null;

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={t('regionLabel')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={resumeIfFocusLeft}
    >
      <div className="mx-auto max-w-3xl overflow-hidden">
        <div
          className="transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          <div className="flex">
            {products.map((product, slideIndex) => (
              <div
                key={product.id}
                className="min-w-full"
                inert={slideIndex === index ? undefined : true}
              >
                <ProductCard product={product} linkPosition={linkPosition} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {hasMultiple ? (
        <div className="mx-auto mt-3 h-1 w-full max-w-3xl overflow-hidden rounded-full bg-line" aria-hidden>
          <div
            data-testid="carousel-progress"
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {hasMultiple ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={t('prev')}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => step(1)}
            aria-label={t('next')}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-pressed={!paused}
            aria-label={paused ? t('play') : t('pause')}
            className="ml-1 inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary"
          >
            {paused ? (
              <Play className="size-4" aria-hidden />
            ) : (
              <Pause className="size-4" aria-hidden />
            )}
            {paused ? t('play') : t('pause')}
          </button>
        </div>
      ) : null}

      <ul className="mt-4 flex justify-center gap-2">
        {products.map((product, dotIndex) => (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => goTo(dotIndex)}
              aria-label={t('slideLabel', { current: dotIndex + 1, total: count })}
              aria-current={dotIndex === index}
              className="flex min-h-touch items-center"
            >
              <span
                className={
                  dotIndex === index
                    ? 'h-2 w-6 rounded-full bg-primary transition-colors'
                    : 'h-2 w-2 rounded-full bg-line transition-colors hover:bg-ink-muted'
                }
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>

      <p role="status" aria-live="polite" className="sr-only">
        {t('slideLabel', { current: index + 1, total: count })}
      </p>
    </div>
  );
}