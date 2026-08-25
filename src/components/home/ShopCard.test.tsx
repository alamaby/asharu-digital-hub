import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ShopCard } from './ShopCard';
import { shopLinks } from '@/data/shop-links';
import { renderWithMessages } from '@/test/utils';

const shopee = shopLinks.find((link) => link.id === 'shopee')!;
const ACCESSIBLE_NAME = 'Kunjungi Toko Asharu x Nopi.NY (membuka di tab baru)';

function plainShop() {
  const clone: typeof shopee = { ...shopee };
  delete clone.affiliateUrl;
  return clone;
}

function renderCard(shop: typeof shopee) {
  renderWithMessages(<ShopCard shop={shop} linkPosition="test" />);
  return screen.getByRole('link', { name: ACCESSIBLE_NAME });
}

describe('ShopCard', () => {
  it('links to the affiliate URL with sponsored rel when configured', () => {
    const cta = renderCard(shopee);
    expect(cta).toHaveAttribute('href', 'https://id.shp.ee/u1L2EQuP');
    const rel = cta.getAttribute('rel') ?? '';
    for (const token of ['sponsored', 'nofollow', 'noopener', 'noreferrer']) {
      expect(rel).toContain(token);
    }
  });

  it('falls back to the canonical URL without sponsored when no affiliate link', () => {
    const cta = renderCard(plainShop());
    expect(cta).toHaveAttribute('href', 'https://shopee.co.id/shop/9268731');
    expect(cta).toHaveAttribute('rel', 'noopener noreferrer');
    expect(cta.getAttribute('rel')).not.toContain('sponsored');
  });

  it('shows the brand-accent chip and localized copy exactly once as heading', () => {
    renderWithMessages(<ShopCard shop={shopee} linkPosition="test" />);
    expect(
      screen.getByRole('heading', { name: 'Asharu x Nopi.NY' })
    ).toBeInTheDocument();
    expect(document.querySelector('.bg-\\[\\#EE4D2D\\]')).not.toBeNull();
  });

  it('opens in a new tab safely', () => {
    const cta = renderCard(shopee);
    expect(cta).toHaveAttribute('target', '_blank');
  });
});
