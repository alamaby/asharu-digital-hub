import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { AffiliateProduct } from '@/data/schemas';
import { renderWithMessages } from '@/test/utils';

// Local fixture: assertions must not depend on the scraped dataset.
const product: AffiliateProduct = {
  id: 'affiliate-test-1',
  name: { id: 'Produk Uji Satu', en: 'Test Product One' },
  category: 'home-living',
  description: { id: 'Deskripsi uji satu', en: 'Test description one' },
  merchant: 'Toko Uji (Shopee)',
  url: 'https://s.shopee.co.id/test1',
  image: '/images/products/product-placeholder-1.svg',
  featured: true
};
// Expected category label in the id locale.
const categoryLabel = 'Rumah Tangga';

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
