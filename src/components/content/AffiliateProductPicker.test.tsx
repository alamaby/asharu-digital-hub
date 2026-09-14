import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMessages } from '@/test/utils';

const FALLBACK_IMAGE = '/images/products/product-placeholder-1.svg';

const buildRow = (over: Partial<{
  id: string;
  friendly_code: string;
  name_id: string;
  name_en: string;
  category: string;
  merchant: string;
  url: string;
  image: string;
}> = {}): Record<string, unknown> => ({
  id: 'p1',
  friendly_code: 'ASH-001',
  name_id: 'Produk A',
  name_en: 'Product A',
  category: 'Elektronik',
  merchant: 'Toko',
  url: 'https://example.com/p1',
  image: '/images/products/affiliate/p1.webp',
  ...over,
});

const createSupabaseBrowser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowser,
}));

import { AffiliateProductPicker } from './AffiliateProductPicker';

function setClient(rows: Record<string, unknown>[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    or: () => chain,
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve(resolve({ data: rows, error: null })),
  };
  createSupabaseBrowser.mockReturnValue({ from: () => ({ select: chain.select }) });
}

describe('AffiliateProductPicker', () => {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const onConfirmSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders product image in single mode', async () => {
    setClient([buildRow({ image: '/images/p-a.webp' })]);

    renderWithMessages(
      <AffiliateProductPicker draftId="d1" onSelect={onSelect} onClose={onClose} />
    );

    await vi.waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/images/p-a.webp');
    expect(img).toHaveAttribute('alt', 'Produk A');
  });

  it('renders placeholder image when product image is null', async () => {
    setClient([buildRow({ image: null as unknown as string })]);

    renderWithMessages(
      <AffiliateProductPicker draftId="d1" onSelect={onSelect} onClose={onClose} />
    );

    await vi.waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(screen.getByRole('img')).toHaveAttribute('src', FALLBACK_IMAGE);
  });

  it('renders product image in multi mode with checkbox', async () => {
    setClient([buildRow({ id: 'p2', image: '/images/p-b.webp' })]);

    renderWithMessages(
      <AffiliateProductPicker
        draftId="d1"
        multi
        maxSelect={2}
        onSelect={onSelect}
        onClose={onClose}
        onConfirmSelect={onConfirmSelect}
      />
    );

    await vi.waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(screen.getByRole('img')).toHaveAttribute('src', '/images/p-b.webp');
  });

  it('onConfirm emits selected items with image from cache', async () => {
    const rows = [buildRow({ id: 'p3', image: '/images/p-c.webp' })];
    setClient(rows);

    renderWithMessages(
      <AffiliateProductPicker
        draftId="d1"
        multi
        maxSelect={2}
        onSelect={onSelect}
        onClose={onClose}
        onConfirmSelect={onConfirmSelect}
      />
    );

    await vi.waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', '/images/p-c.webp'));

    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    const confirmBtn = screen.getByRole('button', { name: /Pilih produk/i });
    await userEvent.click(confirmBtn);

    await vi.waitFor(() => expect(onConfirmSelect).toHaveBeenCalled());
    const confirmed = onConfirmSelect.mock.calls[0]?.[0]?.[0];
    expect(confirmed).toMatchObject({ id: 'p3', image: '/images/p-c.webp' });
  });
});
