import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/analytics/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics/events')>()),
  trackEvent: vi.fn()
}));

import { ViewPropertyTracker } from '@/components/analytics/ViewPropertyTracker';
import { trackEvent } from '@/lib/analytics/events';

const mockedTrack = vi.mocked(trackEvent);

describe('ViewPropertyTracker', () => {
  beforeEach(() => {
    mockedTrack.mockClear();
  });

  it('fires view_property once with the listing id', () => {
    render(<ViewPropertyTracker itemId="rumah-contoh-bandung" />);
    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack).toHaveBeenCalledWith('view_property', {
      item_id: 'rumah-contoh-bandung',
      link_position: 'property-detail'
    });
  });

  it('never fires twice on rerender or prop change', () => {
    const { rerender } = render(<ViewPropertyTracker itemId="a" />);
    rerender(<ViewPropertyTracker itemId="a" />);
    expect(mockedTrack).toHaveBeenCalledTimes(1);
  });
});
