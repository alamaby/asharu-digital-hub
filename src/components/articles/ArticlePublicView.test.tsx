import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArticleMarkdownBody, linkifyText } from './ArticlePublicView';

describe('linkifyText', () => {
  it('teks polos tanpa URL kembali utuh tanpa anchor', () => {
    const { container } = render(<p>{linkifyText('Halo dunia')}</p>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('Halo dunia');
  });

  it('URL inline jadi anchor https yang bisa diklik', () => {
    const { container } = render(<p>{linkifyText('Beli di https://s.shopee.co.id/xyz sekarang')}</p>);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://s.shopee.co.id/xyz');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });

  it('titik akhir kalimat tidak ikut href', () => {
    const { container } = render(<p>{linkifyText('Lihat https://example.com/p.')}</p>);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/p');
    expect(container.textContent).toBe('Lihat https://example.com/p.');
  });
});

describe('ArticleMarkdownBody', () => {
  it('paragraf ber-URL me-render anchor, h2 tetap teks', () => {
    render(<ArticleMarkdownBody md={'## Judul https://example.com\n\nBeli https://s.shopee.co.id/xyz di sini'} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('https://example.com');
    const link = screen.getByRole('link', { name: 'https://s.shopee.co.id/xyz' });
    expect(link.getAttribute('href')).toBe('https://s.shopee.co.id/xyz');
  });
});
