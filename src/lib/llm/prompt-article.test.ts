import { describe, expect, it } from 'vitest';
import {
  ARTICLE_MIN_WORDS,
  buildArticlePrompt,
  countArticleWords,
  parseArticleDraft,
  slugifyTitle,
  type ArticleLangDraft
} from './prompt';

const product = { friendlyCode: 'ASH-001', name: 'Keyboard Mekanik X', url: 'https://example.com/p', category: 'electronics' };

function validLang(over: Partial<ArticleLangDraft> = {}): ArticleLangDraft {
  return {
    title: '7 Tips Memilih Keyboard Mekanik untuk WFH',
    slug: 'tips-memilih-keyboard-mekanik-wfh',
    excerpt:
      'Keyboard mekanik yang tepat membuat kerja dari rumah jauh lebih nyaman dan produktif setiap hari untuk semua orang.',
    sections: [
      { h2: 'Kenali switch yang cocok', body: 'Switch adalah komponen utama yang menentukan rasa ketikan keyboard mekanik Anda setiap hari. '.repeat(40) },
      { h2: 'Perhatikan ukuran layout', body: 'Ukuran layout menentukan seberapa banyak ruang meja yang tersisa untuk mouse dan dokumen kerja. '.repeat(40) },
      { h2: 'Anggaran dan garansi', body: 'Tentukan anggaran sebelum berburu agar pilihan tetap rasional dan sesuai kebutuhan kerja harian Anda. '.repeat(40) },
      { h2: 'Rekomendasi produk', body: `Btw, kalau setup kamu butuh upgrade {{PRODUCT_URL}} Keyboard Mekanik X bisa jadi pilihan yang nyaman. `.repeat(20) }
    ],
    faq: [{ q: 'Apakah keyboard mekanik berisik?', a: 'Tergantung switch yang dipilih, ada varian silent yang hening.' }],
    meta_title: '7 Tips Memilih Keyboard Mekanik untuk WFH',
    meta_desc: 'Panduan lengkap memilih keyboard mekanik yang nyaman untuk kerja dari rumah, dari switch hingga anggaran.',
    ...over
  };
}

describe('buildArticlePrompt', () => {
  it('meminta kedua bahasa untuk language=both', () => {
    const { system, user } = buildArticlePrompt(
      { topic: 'keyboard', tone: 'casual', audience: 'pekerja', ctaStyle: 'soft_sell', purpose: 'edukasi', language: 'both' },
      product
    );
    expect(system).toContain('BOTH "id" dan "en"');
    expect(system).toContain('{{PRODUCT_URL}}');
    expect(user).toContain('ASH-001');
  });

  it('meminta satu bahasa saja untuk language=id', () => {
    const { system } = buildArticlePrompt(
      { topic: 'keyboard', tone: 'casual', audience: 'pekerja', ctaStyle: 'soft_sell', purpose: 'edukasi', language: 'id' },
      product
    );
    expect(system).toContain('HANYA "id"');
  });
});

describe('parseArticleDraft', () => {
  it('parse artikel dua bahasa yang valid', () => {
    const raw = JSON.stringify({ id: validLang(), en: validLang({ slug: 'tips-choosing-keyboard', title: '7 Tips for Choosing a Keyboard' }) });
    const parsed = parseArticleDraft(raw);
    expect(parsed?.id?.slug).toBe('tips-memilih-keyboard-mekanik-wfh');
    expect(parsed?.en?.slug).toBe('tips-choosing-keyboard');
  });

  it('strip markdown fence', () => {
    const raw = '```json\n' + JSON.stringify({ id: validLang(), en: null }) + '\n```';
    expect(parseArticleDraft(raw)?.id).not.toBeNull();
    expect(parseArticleDraft(raw)?.en).toBeNull();
  });

  it('null untuk JSON rusak', () => {
    expect(parseArticleDraft('bukan json')).toBeNull();
  });

  it('null bila slug tak valid dan section kurang', () => {
    const bad = validLang({ slug: 'Slug Buruk!!', sections: [{ h2: 'a', body: 'b' }] });
    expect(parseArticleDraft(JSON.stringify({ id: bad, en: null }))).toBeNull();
  });
});

describe('countArticleWords', () => {
  it('menghitung kata excerpt + body', () => {
    const words = countArticleWords(validLang());
    expect(words).toBeGreaterThan(ARTICLE_MIN_WORDS);
  });
});

describe('slugifyTitle', () => {
  it('slugify judul Indonesia', () => {
    expect(slugifyTitle('7 Tips Memilih Keyboard Mekanik untuk WFH!')).toBe('7-tips-memilih-keyboard-mekanik-untuk-wfh');
  });

  it('fallback artikel untuk input kosong', () => {
    expect(slugifyTitle('!!!')).toBe('artikel');
  });
});
