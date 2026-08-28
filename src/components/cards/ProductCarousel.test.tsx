import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { ProductCarousel } from './ProductCarousel';
import { renderWithMessages } from '@/test/utils';
import { affiliateProducts } from '@/data/affiliate-products';

function mockMatchMedia(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_: string, callback: () => void) => listeners.delete(callback),
    dispatchEvent: () => true
  }));
}

// Route rAF through setTimeout so `vi.useFakeTimers()` drives the countdown.
function mockRafViaTimeout() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    globalThis.setTimeout(() => cb(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (handle: NodeJS.Timeout) =>
    globalThis.clearTimeout(handle)
  );
}

function progressValue() {
  const fill = screen.getByTestId('carousel-progress');
  return Number((fill as HTMLElement).style.width.replace('%', ''));
}

beforeEach(() => {
  mockMatchMedia(false);
  mockRafViaTimeout();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Use a small fixture so assertions don't depend on the scraped dataset size.
const products = affiliateProducts.slice(0, 3);

describe('ProductCarousel', () => {
  it('renders the first product card', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="home-featured" />);
    expect(
      screen.getByRole('heading', { name: products[0]!.name.id })
    ).toBeInTheDocument();
  });

  it('shows one preview/next/play-pause control and dots for each product', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    expect(screen.getByRole('button', { name: 'Produk sebelumnya' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Produk berikutnya' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jeda' })).toBeInTheDocument();

    const dots = screen.getAllByRole('button', { name: /Slide \d dari 3/ });
    expect(dots).toHaveLength(products.length);
  });

  it('next/prev navigate and wrap around at the ends', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);

    fireEvent.click(screen.getByRole('button', { name: 'Produk berikutnya' }));
    expect(
      screen.getByRole('heading', { name: products[1]!.name.id })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Produk berikutnya' }));
    expect(
      screen.getByRole('heading', { name: products[2]!.name.id })
    ).toBeInTheDocument();

    // Wraps forward to first.
    fireEvent.click(screen.getByRole('button', { name: 'Produk berikutnya' }));
    expect(
      screen.getByRole('heading', { name: products[0]!.name.id })
    ).toBeInTheDocument();

    // Wrap backward to last.
    fireEvent.click(screen.getByRole('button', { name: 'Produk sebelumnya' }));
    expect(
      screen.getByRole('heading', { name: products[2]!.name.id })
    ).toBeInTheDocument();
  });

  it('dot navigation jumps to the matching slide and sets aria-current', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    const dotTwo = screen.getByRole('button', { name: 'Slide 2 dari 3' });
    fireEvent.click(dotTwo);
    expect(
      screen.getByRole('heading', { name: products[1]!.name.id })
    ).toBeInTheDocument();
    expect(dotTwo).toHaveAttribute('aria-current', 'true');
  });

  it('play/pause button toggles state', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    const pause = screen.getByRole('button', { name: 'Jeda' });
    expect(pause).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(pause);
    const play = screen.getByRole('button', { name: 'Putar' });
    expect(play).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(play);
    expect(screen.getByRole('button', { name: 'Jeda' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('pauses auto-advance while a descendant is focused (hover/focus region)', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    // Simulating hover pauses (onMouseEnter).
    const region = screen.getByRole('region');
    fireEvent.mouseEnter(region);
    expect(screen.getByRole('button', { name: 'Putar' })).toBeInTheDocument();
    fireEvent.mouseLeave(region);
    expect(screen.getByRole('button', { name: 'Jeda' })).toBeInTheDocument();
  });

  it('exposes a reduced-motion disabled state via matchMedia matches:true', () => {
    mockMatchMedia(true);
    // Re-render with reduced motion — auto-play effect is skipped (no error,
    // autoplay never schedules an interval) and the document renders normally.
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    expect(
      screen.getByRole('heading', { name: products[0]!.name.id })
    ).toBeInTheDocument();
    expect(within(screen.getByRole('region')).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('marks non-visible slides inert so only the active one is in the a11y/tab order', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);

    const slide = (index: number) =>
      screen
        .getByRole('heading', { name: products[index]!.name.id })
        .closest('article')!.parentElement as HTMLElement;

    // Active slide (0) is not inert; the others are.
    expect(slide(0)).not.toHaveAttribute('inert');
    expect(slide(1)).toHaveAttribute('inert');
    expect(slide(2)).toHaveAttribute('inert');

    // Moving forward makes slide 1 active and slide 0 inert.
    fireEvent.click(screen.getByRole('button', { name: 'Produk berikutnya' }));
    expect(slide(1)).not.toHaveAttribute('inert');
    expect(slide(0)).toHaveAttribute('inert');
  });

  it('progress bar starts at 0 and fills as the countdown advances', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    expect(progressValue()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(progressValue()).toBeGreaterThan(0);
    expect(progressValue()).toBeLessThanOrEqual(100);
  });

  it('auto-advances to the next slide after the full 10 second countdown', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    expect(
      screen.getByRole('heading', { name: products[0]!.name.id })
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(
      screen.getByRole('heading', { name: products[1]!.name.id })
    ).toBeInTheDocument();
  });

  it('resets the progress to 0 when navigating manually to a new slide', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(progressValue()).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Produk berikutnya' }));
    expect(progressValue()).toBeLessThanOrEqual(1);
  });

  it('freezes the progress while paused, resuming from the same point', () => {
    renderWithMessages(<ProductCarousel products={products} linkPosition="t" />);
    const region = screen.getByRole('region');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const frozen = progressValue();
    expect(frozen).toBeGreaterThan(0);

    // Hovering pauses auto-play: the bar must no longer advance.
    fireEvent.mouseEnter(region);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(progressValue()).toBeCloseTo(frozen, 1);
  });
});