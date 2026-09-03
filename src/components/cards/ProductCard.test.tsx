import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import { affiliateProducts } from '@/data/affiliate-products';
import { renderWithMessages } from '@/test/utils';

// Choose a deterministic product for assertions from the (scraped) dataset.
const product = affiliateProducts[0]!;
// Expected category label in the id locale.
const categoryLabel = { automotive: 'Otomotif', electronics: 'Elektronik', 'home-living': 'Rumah Tangga', fashion: 'Fashion', 'sports-hobby': 'Olahraga & Hobi', others: 'Lainnya' }[product.category];

describe('ProductCard', () => {
  it('renders localized name, category and merchant', () => {
    const { container } = renderWithMessages(
      <ProductCard product={product} linkPosition="test-position" />
    );

    expect(screen.getByRole('heading', { name: product.name.id })).toBeInTheDocument();
    expect(screen.getByText(categoryLabel)).toBeInTheDocument();
    expect(screen.getByText(product.merchant)).toBeInTheDocument();
    expect(container.querySelector('.sr-only')?.textContent).toBe('Merchant: ');
  });

  it('shows the visible affiliate badge', () => {
    renderWithMessages(<ProductCard product={product} linkPosition="t" />);
    expect(screen.getByText('Tautan afiliasi')).toBeInTheDocument();
  });

  it('affiliate CTA is external, new-tab, sponsored nofollow with safe params', () => {
    renderWithMessages(
      <ProductCard product={product} linkPosition="home-featured" />
    );

    const cta = screen.getByRole('link', { name: /Lihat Produk/ });
    expect(cta).toHaveAttribute('href', product.url);
    expect(cta).toHaveAttribute('target', '_blank');
    const rel = cta.getAttribute('rel') ?? '';
    for (const token of ['sponsored', 'nofollow', 'noopener', 'noreferrer']) {
      expect(rel).toContain(token);
    }
  });

  it('uses the price-check pattern instead of fake prices', () => {
    renderWithMessages(<ProductCard product={product} linkPosition="t" />);
    expect(screen.getAllByText('Cek harga terbaru').length).toBeGreaterThan(0);
    expect(screen.getByText('Harga dapat berubah di platform penjual.')).toBeInTheDocument();
  });
});
