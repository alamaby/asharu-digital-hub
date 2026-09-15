import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { ShareButtons } from './ShareButtons';
import { renderWithMessages } from '@/test/utils';

vi.mock('@/lib/utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined)
}));

const CANONICAL =
  'https://asharu.id/id/artikel/kipas-genggam-bandung-solusi-panas';
const TITLE = 'Panas Bandung Bikin Gerah? Kipas Genggam Solusi Wajib!';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('ShareButtons', () => {
  it('me-render 5 anchor berurutan WA, Threads, X, Facebook, Telegram + tombol salin', () => {
    renderWithMessages(<ShareButtons canonicalUrl={CANONICAL} title={TITLE} />);

    expect(
      screen.getByRole('heading', { name: 'Bagikan artikel ini' })
    ).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Bagikan via WhatsApp',
      'Bagikan via Threads',
      'Bagikan via X',
      'Bagikan via Facebook',
      'Bagikan via Telegram'
    ]);

    const hrefs = links.map((a) => a.getAttribute('href') ?? '');
    expect(hrefs[0]).toContain('https://wa.me/?text=');
    expect(hrefs[1]).toContain('https://www.threads.net/intent/post?text=');
    expect(hrefs[2]).toContain('https://x.com/intent/tweet?');
    expect(hrefs[3]).toContain('https://www.facebook.com/sharer/sharer.php?');
    expect(hrefs[4]).toContain('https://t.me/share/url?');

    // Setiap href membawa utm_source channel-nya + rel aman + tab baru.
    const sources = ['whatsapp', 'threads', 'x', 'facebook', 'telegram'];
    hrefs.forEach((href, i) => {
      expect(href).toContain(`utm_source%3D${sources[i]}`);
      expect(links[i]?.getAttribute('target')).toBe('_blank');
      expect(links[i]?.getAttribute('rel')).toContain('noopener');
    });

    expect(
      screen.getByRole('button', { name: 'Salin tautan' })
    ).toBeInTheDocument();
  });

  it('tombol salin menulis URL utm_copy ke clipboard + tampilkan status', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithMessages(<ShareButtons canonicalUrl={CANONICAL} title={TITLE} />);

    await user.click(screen.getByRole('button', { name: 'Salin tautan' }));

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    const copied = String(vi.mocked(copyToClipboard).mock.calls[0]?.[0] ?? '');
    expect(copied).toContain(CANONICAL);
    expect(copied).toContain('utm_source=copy');
    expect(
      await screen.findByRole('button', { name: 'Tautan disalin!' })
    ).toBeInTheDocument();
  });

  it('tanpa navigator.share tidak ada tombol native', () => {
    renderWithMessages(<ShareButtons canonicalUrl={CANONICAL} title={TITLE} />);
    expect(
      screen.queryByRole('button', { name: 'Lainnya...' })
    ).not.toBeInTheDocument();
  });

  it('dengan navigator.share tombol native muncul terakhir dan memakai utm native', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true
    });
    const user = userEvent.setup();
    renderWithMessages(<ShareButtons canonicalUrl={CANONICAL} title={TITLE} />);

    const buttons = await screen.findAllByRole('button');
    // Salin dulu, native selalu terakhir.
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Salin tautan',
      'Lainnya...'
    ]);

    await user.click(screen.getByRole('button', { name: 'Lainnya...' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({
      title: TITLE,
      text: TITLE,
      url: expect.stringContaining('utm_source=native')
    });
  });
});
