import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageHistoryCarousel } from './ImageHistoryCarousel';
import type { DraftImageRow } from '@/lib/image/types';

// jsdom tidak punya matchMedia/IntersectionObserver (tiru stub ProductCarousel.test).
function mockMatchMedia(matches = false) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  }));
}

function mockIntersectionObserver() {
  vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation(() => ({
    observe: () => {},
    unobserve: () => {},
    disconnect: () => {},
    takeRecords: () => []
  })));
}

function mockResizeObserver() {
  vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
    observe: () => {},
    unobserve: () => {},
    disconnect: () => {}
  })));
}

beforeEach(() => {
  mockMatchMedia();
  mockIntersectionObserver();
  mockResizeObserver();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function row(over: Partial<DraftImageRow> & { id: string }): DraftImageRow {
  return {
    draft_id: 'd1',
    post_index: 0,
    image_prompt: '',
    negative_prompt: null,
    reasoning: null,
    style_slug: null,
    camera_slug: null,
    provider_slug: '',
    model_id: '',
    key_suffix: null,
    storage_path: null,
    public_url: null,
    width: null,
    height: null,
    status: 'pending',
    last_error: null,
    attempts: 0,
    llm_meta: null,
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    ...over
  };
}

const rows: DraftImageRow[] = [
  row({ id: 'newest', status: 'ready', provider_slug: 'pixazo', model_id: 'flux-schnell', style_slug: 'clean', public_url: 'https://cdn.test/1.png', image_prompt: 'newest prompt text' }),
  row({ id: 'older-failed', status: 'failed', provider_slug: 'pollinations', model_id: 'flux', last_error: 'boom', image_prompt: 'older prompt text' }),
  row({ id: 'chosen', status: 'selected', provider_slug: 'bynara', model_id: 'gpt-image', public_url: 'https://cdn.test/2.png', image_prompt: 'selected prompt text' })
];

function slidesOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="image-slide"]'));
}

function slideAt(container: HTMLElement, index: number): HTMLElement {
  const slide = slidesOf(container)[index];
  if (!slide) throw new Error(`slide ${index} not found`);
  return slide;
}

function slideButtons(slide: HTMLElement): string[] {
  return Array.from(slide.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
}

describe('ImageHistoryCarousel', () => {
  it('renders latest first with provider/model/style info per slide', () => {
    const { container } = render(<ImageHistoryCarousel rows={rows} selectedId="chosen" />);
    expect(slidesOf(container)).toHaveLength(3);
    expect(slideAt(container, 0).textContent).toContain('newest prompt text');
    expect(slideAt(container, 1).textContent).toContain('older prompt text');
    expect(slideAt(container, 2).textContent).toContain('selected prompt text');
    expect(slideAt(container, 0).textContent).toContain('pixazo · flux-schnell · clean');
    expect(slideAt(container, 1).textContent).toContain('pollinations · flux');
  });

  it('marks only the selected slide with Terpilih badge', () => {
    const { container } = render(<ImageHistoryCarousel rows={rows} selectedId="chosen" />);
    expect(slideAt(container, 2).textContent).toContain('Terpilih');
    expect(slideAt(container, 0).textContent).not.toContain('Terpilih');
    expect(slideAt(container, 1).textContent).not.toContain('Terpilih');
  });

  it('shows Pilih on ready slide, Ulangi + error on failed slide', () => {
    const { container } = render(
      <ImageHistoryCarousel rows={rows} selectedId="chosen" onSelect={() => {}} onRetry={() => {}} />
    );
    expect(slideButtons(slideAt(container, 0))).toContain('Pilih');
    expect(slideButtons(slideAt(container, 1))).toContain('Ulangi');
    expect(slideAt(container, 1).textContent).toContain('Error: boom');
    expect(slideButtons(slideAt(container, 2))).not.toContain('Pilih');
  });

  it('calls onSelect with the slide image id', () => {
    const onSelect = vi.fn();
    const { container } = render(<ImageHistoryCarousel rows={rows} selectedId="chosen" onSelect={onSelect} />);
    const pick = Array.from(slideAt(container, 0).querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Pilih');
    expect(pick).toBeTruthy();
    fireEvent.click(pick as HTMLButtonElement);
    expect(onSelect).toHaveBeenCalledWith('newest');
  });

  it('shows counter and dots for multiple slides', () => {
    render(<ImageHistoryCarousel rows={rows} selectedId={null} />);
    expect(screen.getByTestId('slide-counter').textContent).toBe('1/3');
    expect(screen.getByRole('button', { name: 'Slide sebelumnya' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Slide berikutnya' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Slide 2 dari 3' })).toBeInTheDocument();
  });

  it('renders no navigation controls for a single slide', () => {
    const { container } = render(<ImageHistoryCarousel rows={[rows[0] as DraftImageRow]} selectedId={null} />);
    expect(container.querySelectorAll('[data-testid="image-slide"]')).toHaveLength(1);
    expect(screen.queryByTestId('slide-counter')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Slide berikutnya' })).toBeNull();
  });

  it('shows status placeholder text for pending and prompt_ready slides', () => {
    const { container } = render(
      <ImageHistoryCarousel
        rows={[
          row({ id: 'p', status: 'pending' }),
          row({ id: 'pr', status: 'prompt_ready', image_prompt: 'draf otomatis' })
        ]}
        selectedId={null}
      />
    );
    expect(slideAt(container, 0).textContent).toContain('Masuk antrean');
    expect(slideAt(container, 1).textContent).toContain('Draf prompt otomatis siap');
  });

  it('downloads the slide image via fetch → blob and revokes the object URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['img-bytes']))
    });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    // jsdom belum mendukung unduhan: cegah anchor.click() memicu navigation.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const prevCreate = URL.createObjectURL;
    const prevRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    try {
      const { container } = render(<ImageHistoryCarousel rows={rows} selectedId="chosen" />);
      const unduh = Array.from(slideAt(container, 0).querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Unduh');
      expect(unduh).toBeTruthy();
      fireEvent.click(unduh as HTMLButtonElement);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('https://cdn.test/1.png'));
      await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'));
    } finally {
      URL.createObjectURL = prevCreate;
      URL.revokeObjectURL = prevRevoke;
    }
  });

  it('falls back to opening the image in a new tab when download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(<ImageHistoryCarousel rows={rows} selectedId="chosen" />);
    const unduh = Array.from(slideAt(container, 0).querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Unduh');
    expect(unduh).toBeTruthy();
    fireEvent.click(unduh as HTMLButtonElement);
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://cdn.test/1.png', '_blank', 'noreferrer'));
  });
});
