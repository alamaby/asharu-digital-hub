import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ArticleMarkdownBody,
  ArticlePublicView,
  linkifyText,
  renderRichText
} from './ArticlePublicView';

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

  it('me-render **tebal** dan *miring* di paragraf', () => {
    render(<ArticleMarkdownBody md={'Jangan **terpaku harga murah**, prioritaskan *kualitas* ya'} />);
    expect(screen.getByText('terpaku harga murah').tagName).toBe('STRONG');
    expect(screen.getByText('kualitas').tagName).toBe('EM');
  });
});

describe('renderRichText', () => {
  it('kombinasi bold + link dalam satu paragraf', () => {
    const { container } = render(<p>{renderRichText('Coba **Kipas Genggam** di https://s.shopee.co.id/xyz!')}</p>);
    expect(container.querySelector('strong')?.textContent).toBe('Kipas Genggam');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://s.shopee.co.id/xyz');
    expect(container.textContent).toContain('!');
  });

  it('tanda bintang tak berpasangan dibiarkan literal', () => {
    const { container } = render(<p>{renderRichText('Nilai 5*3 sama dengan 15')}</p>);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('em')).toBeNull();
    expect(container.textContent).toBe('Nilai 5*3 sama dengan 15');
  });
});

const PLACEHOLDER_SRC = '/images/products/product-placeholder-1.svg';

function renderPublicView(affiliate: {
  name: string | null;
  url: string;
  image: string | null;
}) {
  return render(
    <ArticlePublicView
      title="Judul Artikel"
      excerpt="Ringkasan"
      dateLine={null}
      coverUrl={null}
      bodyMd="Intro"
      affiliate={affiliate}
      affiliateTitle="Produk yang disebut di artikel ini"
      affiliateBody="Tautan afiliasi"
      affiliateCta="Lihat produk"
      affiliateNote="Catatan"
      faqHeading="FAQ"
      faq={[]}
      disclosureNote="Disclosure"
      disclosureLinkLabel={null}
      disclosureHref={null}
    />
  );
}

describe('ArticlePublicView affiliate panel', () => {
  it('image null → img placeholder lokal tetap tampil', () => {
    renderPublicView({
      name: 'Kipas',
      url: 'https://s.shopee.co.id/xyz',
      image: null
    });
    const img = screen.getByRole('img', { name: 'Kipas' });
    expect(img.getAttribute('src')).toBe(PLACEHOLDER_SRC);
  });

  it('onError sekali → placeholder; error kedua tidak loop', () => {
    renderPublicView({
      name: 'Kipas',
      url: 'https://s.shopee.co.id/xyz',
      image: 'https://example.com/rusak.jpg'
    });
    const img = screen.getByRole('img', { name: 'Kipas' });
    expect(img.getAttribute('src')).toBe('https://example.com/rusak.jpg');

    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(PLACEHOLDER_SRC);

    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(PLACEHOLDER_SRC);
  });
});

describe('ArticleMarkdownBody affiliate inline', () => {
  const affiliate = {
    name: 'Kipas',
    url: 'https://s.shopee.co.id/xyz',
    image: null
  };

  it('tepat 1 img di paragraf ber-URL afiliasi, paragraf lain tanpa img', () => {
    const { container } = render(
      <ArticleMarkdownBody
        md={'Intro\n\nBeli https://s.shopee.co.id/xyz di sini\n\nOutro'}
        affiliate={affiliate}
      />
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.getAttribute('src')).toBe(PLACEHOLDER_SRC);
    // Paragraf tengah (dengan img) + Intro + Outro = 3 <p>.
    expect(container.querySelectorAll('p')).toHaveLength(3);
  });

  it('h2 ber-URL afiliasi tidak bergambar', () => {
    const { container } = render(
      <ArticleMarkdownBody
        md={'## Beli https://s.shopee.co.id/xyz'}
        affiliate={affiliate}
      />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('affiliate ada tapi md tanpa URL-nya → tidak ada img', () => {
    const { container } = render(
      <ArticleMarkdownBody md={'Intro tanpa tautan'} affiliate={affiliate} />
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
