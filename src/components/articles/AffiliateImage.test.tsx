import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AFFILIATE_FALLBACK_IMAGE, AffiliateImage } from './AffiliateImage';

describe('AffiliateImage', () => {
  it('render src asli bila tersedia', () => {
    render(
      <AffiliateImage
        src="https://example.com/produk.webp"
        alt="Kipas"
        width={48}
        height={48}
        className="size-12"
      />
    );
    const img = screen.getByRole('img', { name: 'Kipas' });
    expect(img.getAttribute('src')).toBe('https://example.com/produk.webp');
    expect(img.getAttribute('width')).toBe('48');
  });

  it('onError sekali → placeholder; error kedua tidak loop', () => {
    render(
      <AffiliateImage
        src="https://example.com/rusak.jpg"
        alt="Kipas"
        width={64}
        height={64}
      />
    );
    const img = screen.getByRole('img', { name: 'Kipas' });
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(AFFILIATE_FALLBACK_IMAGE);
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(AFFILIATE_FALLBACK_IMAGE);
  });
});
