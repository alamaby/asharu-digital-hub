'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AffiliateProduct } from '@/data/schemas';
import { ProductCard } from './ProductCard';

const AUTO_ADVANCE_MS = 10_000;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

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
  const reducedRef = useRef(false);
  const regionRef = useRef<HTMLDivElement>(null);

  const count = products.length;
  const hasMultiple = count > 1;

  // Keep the reduced-motion preference in a ref (read inside the interval effect).
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

  // Auto-advance every AUTO_ADVANCE_MS unless paused or reduced-motion.
  useEffect(() => {
    if (!hasMultiple || paused || reducedRef.current) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [hasMultiple, paused, count]);

  const goTo = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
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
      <div className="max-w-3xl overflow-hidden">
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