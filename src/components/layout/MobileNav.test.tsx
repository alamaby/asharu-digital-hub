import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pathnameMock = vi.fn(() => '/');

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, onClick, ...rest }: ComponentProps<'a'>) => (
    <a onClick={onClick} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => pathnameMock(),
  useRouter: () => ({ replace: vi.fn() }),
  redirect: vi.fn(),
  getPathname: vi.fn()
}));

import { MobileNav } from '@/components/layout/MobileNav';
import { renderWithMessages } from '@/test/utils';

describe('MobileNav', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
  });

  it('starts closed with aria-expanded=false', () => {
    renderWithMessages(<MobileNav />);
    const toggle = screen.getByRole('button', { name: 'Buka menu navigasi' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('opens the panel with nav links and language switcher', async () => {
    const user = userEvent.setup();
    renderWithMessages(<MobileNav />);

    const toggle = screen.getByRole('button', { name: 'Buka menu navigasi' });
    await user.click(toggle);

    expect(document.getElementById('mobile-menu')).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'Produk Afiliasi' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Pilih bahasa' })).toBeInTheDocument();
  });

  it('Escape closes the panel and restores focus to the toggle', async () => {
    const user = userEvent.setup();
    renderWithMessages(<MobileNav />);

    const toggle = screen.getByRole('button', { name: 'Buka menu navigasi' });
    await user.click(toggle);
    await user.keyboard('{Escape}');

    expect(document.getElementById('mobile-menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buka menu navigasi' })).toHaveFocus();
  });
});
