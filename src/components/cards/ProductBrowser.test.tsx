import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AffiliateProduct } from '@/data/schemas';
import { ProductBrowser } from './ProductBrowser';
import { renderWithMessages } from '@/test/utils';

function makeProduct(
  id: string,
  category: AffiliateProduct['category'],
  name = `Produk ${id}`
): AffiliateProduct {
  return {
    id,
    name: { id: name, en: name },
    category,
    description: { id: name, en: name },
    merchant: 'Toko Uji',
    url: `https://example.com/${id}`,
    image: '/images/products/affiliate/placeholder.svg',
    featured: false
  };
}

const products: AffiliateProduct[] = [
  makeProduct('e-1', 'electronics', 'Mouse'),
  makeProduct('e-2', 'electronics', 'Keyboard'),
  makeProduct('e-3', 'electronics', 'Headphone'),
  makeProduct('f-1', 'fashion', 'Kemeja'),
  makeProduct('f-2', 'fashion', 'Sepatu'),
  makeProduct('h-1', 'home-living', 'Lampu'),
  makeProduct('h-2', 'home-living', 'Rak'),
  makeProduct('s-1', 'sports-hobby', 'Matras')
];

describe('ProductBrowser', () => {
  it('renders the first page and hides load-more when all fit on one page', () => {
    renderWithMessages(<ProductBrowser products={products} linkPosition="t" />);
    expect(screen.getAllByRole('article')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: 'Muat 8 lagi' })).toBeNull();
  });

  it('reveals the next 8 products when "Muat 8 lagi" is clicked', async () => {
    const longList = Array.from({ length: 12 }, (_, i) => makeProduct(`p-${i}`, 'fashion'));
    renderWithMessages(<ProductBrowser products={longList} linkPosition="t" />);

    const grid = screen.getByTestId('product-grid');
    expect(within(grid).getAllByRole('article')).toHaveLength(8);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Muat 8 lagi' }));
    expect(within(grid).getAllByRole('article')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Muat 8 lagi' })).toBeNull();
  });

  it('narrows to a single category when its chip is clicked from the "all" state', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ProductBrowser products={products} linkPosition="t" />);

    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Elektronik' }));

    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Elektronik' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('product-result-count')).toHaveTextContent('3 dari 3');
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('resets the filter when "Reset filter" is clicked', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ProductBrowser products={products} linkPosition="t" />);

    await user.click(screen.getByRole('button', { name: 'Olahraga & Hobi' }));
    expect(screen.getByTestId('product-result-count')).toHaveTextContent('1 dari 1');
    expect(screen.getByRole('button', { name: 'Reset filter' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filter' }));
    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('product-result-count')).toHaveTextContent('8 dari 8');
  });

  it('ORs results when a second category is added after narrowing', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ProductBrowser products={products} linkPosition="t" />);

    await user.click(screen.getByRole('button', { name: 'Elektronik' }));
    await user.click(screen.getByRole('button', { name: 'Fashion' }));

    // 3 electronics + 2 fashion = 5.
    expect(screen.getByTestId('product-result-count')).toHaveTextContent('5 dari 5');
    expect(screen.getAllByRole('article')).toHaveLength(5);
  });

  it('reaches the empty state when the only active category is toggled off', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ProductBrowser products={products} linkPosition="t" />);

    await user.click(screen.getByRole('button', { name: 'Elektronik' }));
    // Second click on the same chip removes it → 0 results.
    await user.click(screen.getByRole('button', { name: 'Elektronik' }));

    expect(screen.getByText('Tidak ada produk')).toBeInTheDocument();
    expect(screen.queryByTestId('product-grid')).toBeNull();
  });

  it('resets visible count to 8 when a filter changes mid-pagination', async () => {
    const longList = Array.from({ length: 20 }, (_, i) => makeProduct(`p-${i}`, 'fashion'));
    renderWithMessages(<ProductBrowser products={longList} linkPosition="t" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Muat 8 lagi' }));
    expect(screen.getAllByRole('article')).toHaveLength(16);

    await user.click(screen.getByRole('button', { name: 'Fashion' }));
    expect(screen.getAllByRole('article')).toHaveLength(8);
  });

  it('category chips only render categories present in the dataset', () => {
    const fashionOnly = [makeProduct('f-1', 'fashion'), makeProduct('f-2', 'fashion')];
    renderWithMessages(<ProductBrowser products={fashionOnly} linkPosition="t" />);
    expect(screen.getByRole('button', { name: 'Fashion' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Elektronik' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rumah Tangga' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Olahraga & Hobi' })).toBeNull();
  });

  it('keeps "Semua" pressed when it is the only active filter', async () => {
    const user = userEvent.setup();
    renderWithMessages(<ProductBrowser products={products} linkPosition="t" />);
    // Click "Semua" again — it should stay pressed (no-op).
    await user.click(screen.getByRole('button', { name: 'Semua' }));
    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('product-result-count')).toHaveTextContent('8 dari 8');
  });
});