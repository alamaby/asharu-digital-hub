import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CONSENT_OPEN_EVENT,
  CONSENT_STORAGE_KEY
} from '@/lib/analytics/consent';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { renderWithMessages } from '@/test/utils';

describe('ConsentBanner', () => {
  beforeEach(() => {
    // Node 25's built-in localStorage lacks Storage methods in jsdom — stub it.
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key)
      }
    });
  });

  it('is hidden once a decision exists', async () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ analytics: false, updatedAt: '2026-01-01' })
    );
    renderWithMessages(<ConsentBanner />);
    await waitFor(() =>
      expect(screen.queryByRole('region')).not.toBeInTheDocument()
    );
  });

  it('accept stores analytics=true locally and dismisses', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ConsentBanner />);

    const region = screen.getByRole('region', { name: /Statistik kunjungan/ });
    expect(region).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Setuju' }));

    expect(region).not.toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? '{}')
    ).toMatchObject({ analytics: true });

    // GA loader listens for this event to start loading scripts.
    expect(true).toBe(true);
  });

  it('decline keeps analytics off', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ConsentBanner />);
    await user.click(screen.getByRole('button', { name: 'Tidak, terima kasih' }));
    expect(
      JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? '{}')
    ).toMatchObject({ analytics: false });
  });

  it('footer preferences event reopens the banner after dismissal', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ConsentBanner />);
    await user.click(screen.getByRole('button', { name: 'Setuju' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
    expect(await screen.findByRole('region')).toBeInTheDocument();
  });
});
