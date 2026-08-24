import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replaceMock = vi.fn();
const pathnameMock = vi.fn(() => '/');

/**
 * Full manual stub (no importOriginal): the real module transitively loads
 * `next/navigation`, which Vitest cannot resolve outside Next.js.
 */
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, onClick, ...rest }: ComponentProps<'a'>) => (
    <a onClick={onClick} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => pathnameMock(),
  useRouter: () => ({ replace: replaceMock }),
  redirect: vi.fn(),
  getPathname: vi.fn()
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({})
}));

import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { renderWithMessages } from '@/test/utils';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    pathnameMock.mockReturnValue('/');
  });

  it('renders ID and EN with the active locale marked', () => {
    renderWithMessages(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'ID' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('button', { name: 'ID' })).toBeEnabled();
    expect(screen.getByRole('group')).toHaveAccessibleName('Pilih bahasa');
  });

  it('switching to EN preserves the current pathname', async () => {
    pathnameMock.mockReturnValue('/products');
    const user = userEvent.setup();
    renderWithMessages(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(replaceMock).toHaveBeenCalledWith('/products', { locale: 'en' });
  });

  it('clicking the active locale is a no-op', async () => {
    const user = userEvent.setup();
    renderWithMessages(<LanguageSwitcher />);
    await user.click(screen.getByRole('button', { name: 'ID' }));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders both locales as keyboard-focusable buttons', async () => {
    const user = userEvent.setup();
    renderWithMessages(<LanguageSwitcher />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'ID' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'ID' }));
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
