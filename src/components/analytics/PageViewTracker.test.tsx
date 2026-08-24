import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const pathnameMock = vi.fn(() => '/');
const searchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useSearchParams: () => searchParamsMock()
}));

import { PageViewTracker } from '@/components/analytics/PageViewTracker';
import { trackPageView } from '@/lib/analytics/events';

vi.mock('@/lib/analytics/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics/events')>()),
  trackPageView: vi.fn()
}));

const mockedPageView = vi.mocked(trackPageView);

describe('PageViewTracker', () => {
  beforeEach(() => {
    mockedPageView.mockClear();
    pathnameMock.mockReturnValue('/');
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('sends page_view for the initial path', () => {
    render(<PageViewTracker />);
    expect(mockedPageView).toHaveBeenCalledTimes(1);
    expect(mockedPageView).toHaveBeenCalledWith(
      expect.objectContaining({ page_location: 'http://localhost:3000/' })
    );
  });

  it('does not double-send for the same path', () => {
    const { rerender } = render(<PageViewTracker />);
    rerender(<PageViewTracker />);
    expect(mockedPageView).toHaveBeenCalledTimes(1);
  });

  it('sends again when the path changes', () => {
    const { rerender } = render(<PageViewTracker />);
    pathnameMock.mockReturnValue('/products');
    rerender(<PageViewTracker />);
    expect(mockedPageView).toHaveBeenCalledTimes(2);
    expect(mockedPageView).toHaveBeenLastCalledWith(
      expect.objectContaining({ page_location: 'http://localhost:3000/products' })
    );
  });

  it('appends the query string to page_location', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams([['q', 'x']]));
    render(<PageViewTracker />);
    expect(mockedPageView).toHaveBeenCalledWith(
      expect.objectContaining({ page_location: 'http://localhost:3000/?q=x' })
    );
  });
});
