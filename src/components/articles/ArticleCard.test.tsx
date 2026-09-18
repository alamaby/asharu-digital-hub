import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArticleCard } from './ArticleCard';

const PROPS = {
  slug: 'test-artikel',
  title: 'Judul Artikel',
  excerpt: 'Ringkasan artikel ini adalah contoh.',
  coverUrl: 'https://example.com/cover.jpg',
  publishedAt: '2026-09-18T00:00:00Z',
  locale: 'id' as const,
  readingMinutes: 3,
  hasAffiliate: true,
  readMoreLabel: 'Baca selengkapnya',
  affiliateBadgeLabel: 'Tautan afiliasi',
  readingMinutesLabel: (n: number) => `±${n} mnt baca`,
};

describe('ArticleCard', () => {
  it('merender judul dan ringkasan', () => {
    render(<ArticleCard {...PROPS} />);
    expect(screen.getByText('Judul Artikel')).toBeInTheDocument();
    expect(screen.getByText('Ringkasan artikel ini adalah contoh.')).toBeInTheDocument();
  });

  it('menggunakan coverUrl bila tersedia', () => {
    render(<ArticleCard {...PROPS} />);
    // next-intl mock Link = <a>; img harus ada dengan src cover.
    const img = document.querySelector('img[alt="Judul Artikel"]');
    expect(img?.getAttribute('src')).toBe('https://example.com/cover.jpg');
  });

  it('fallback placeholder saat coverUrl null', () => {
    render(<ArticleCard {...PROPS} coverUrl={null} />);
    const img = document.querySelector('img[aria-hidden="true"]');
    expect(img?.getAttribute('src')).toBe('/images/articles/article-placeholder.svg');
  });

  it('badge afiliasi muncul bila hasAffiliate=true', () => {
    render(<ArticleCard {...PROPS} hasAffiliate />);
    expect(screen.getByText('Tautan afiliasi')).toBeInTheDocument();
  });

  it('tidak menampilkan badge afiliasi bila hasAffiliate=false', () => {
    render(<ArticleCard {...PROPS} hasAffiliate={false} />);
    expect(screen.queryByText('Tautan afiliasi')).not.toBeInTheDocument();
  });

  it('reading label sesuai prop readingMinutesLabel', () => {
    render(<ArticleCard {...PROPS} readingMinutes={7} />);
    expect(screen.getByText('±7 mnt baca')).toBeInTheDocument();
  });

  it('href mengarah ke /artikel/[slug] yang benar', () => {
    render(<ArticleCard {...PROPS} />);
    const link = document.querySelector('a.block');
    expect(link?.getAttribute('href')).toBe('/artikel/test-artikel');
  });
});
