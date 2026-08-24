import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, onClick, ...rest }: ComponentProps<'a'>) => (
    <a onClick={onClick} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() })
}));

import { PropertyBrowser } from './PropertyBrowser';
import { properties } from '@/data/properties';
import { renderWithMessages } from '@/test/utils';

describe('PropertyBrowser filters', () => {
  it('renders all properties with a live count', () => {
    renderWithMessages(<PropertyBrowser properties={properties} linkPosition="t" />);
    expect(screen.getByText(`${properties.length} properti ditampilkan`)).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(properties.length);
  });

  it('filters by transaction type', async () => {
    const user = userEvent.setup();
    renderWithMessages(<PropertyBrowser properties={properties} linkPosition="t" />);

    await user.selectOptions(screen.getByLabelText(/Transaksi/i), 'rent');

    const articles = screen.getAllByRole('article');
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.length).toBeLessThan(properties.length);
    for (const article of articles) {
      expect(article.textContent).toContain('Disewakan');
      expect(article.textContent).not.toContain('Dijual\n');
    }
  });

  it('combined filters can produce the empty state and reset restores it', async () => {
    const user = userEvent.setup();
    renderWithMessages(<PropertyBrowser properties={properties} linkPosition="t" />);

    await user.selectOptions(screen.getByLabelText(/Transaksi/i), 'rent');
    await user.selectOptions(screen.getByLabelText(/Tipe properti/i), 'land');

    expect(screen.getByText('Tidak ada properti yang cocok')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atur ulang filter' }));
    expect(
      screen.getByText(`${properties.length} properti ditampilkan`)
    ).toBeInTheDocument();
  });
});
