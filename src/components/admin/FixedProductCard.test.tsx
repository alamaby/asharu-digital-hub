import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FixedProductCard } from './FixedProductCard';

const products = [
  { id: 'p1', friendly_code: 'ASH-001', name_id: 'Kopi Susu', image: 'https://x.test/a.png', category: 'food', merchant: 'Toko A', url: 'https://toko.test/a' },
  { id: 'p2', friendly_code: 'ASH-002', name_id: 'Teh Manis', image: null, category: null, merchant: null, url: null }
];

describe('FixedProductCard', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<FixedProductCard title="Produk tetap" products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders image, name, category·merchant, link and code chip', () => {
    render(<FixedProductCard title="Produk tetap" products={products} />);
    expect(screen.getByText('Produk tetap')).toBeInTheDocument();
    expect(screen.getByText('Kopi Susu')).toBeInTheDocument();
    expect(screen.getByText('food · Toko A')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Kopi Susu' })).toHaveAttribute('src', 'https://x.test/a.png');
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://toko.test/a');
    expect(screen.getByText('ASH-001')).toBeInTheDocument();
    expect(screen.getByText('Teh Manis')).toBeInTheDocument();
  });
});
