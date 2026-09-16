import { describe, expect, it } from 'vitest';
import {
  ARTICLE_EXCERPT_MAX,
  ARTICLE_MIN_WORDS,
  auditArticleEmoji,
  buildArticleExpandPrompt,
  buildArticlePrompt,
  clampArticleExcerpt,
  countArticleWords,
  findAffiliateSectionIndex,
  parseArticleDraft,
  repairArticleJson,
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

  it('meminta emoji 1 per section + excerpt dan budget kata eksplisit', () => {
    const { system } = buildArticlePrompt(
      { topic: 'keyboard', tone: 'casual', audience: 'pekerja', ctaStyle: 'soft_sell', purpose: 'edukasi', language: 'id' },
      product
    );
    expect(system).toContain('EMOJI');
    expect(system).toContain('800-1500 kata');
    expect(system).toContain('900+ karakter');
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

  it('salvage section yang kehilangan kurung tutup (kasus 87b9fdc1)', () => {
    // Bentuk cacat persis dari expand 16 Sep: `...body"},{"h2":...` tanpa `}{`.
    const malformed =
      '```json\n' +
      JSON.stringify({ id: validLang(), en: null }).replace(/\},\{"h2":/g, ',"h2":') +
      '\n```';
    // Duplicate key = JSON "valid" tapi section kolaps jadi 1 (perilaku insiden).
    const strict = JSON.parse(malformed.replace(/^```json\n|\n```$/g, '')) as {
      id: { sections: unknown[] };
    };
    expect(strict.id.sections).toHaveLength(1);
    const parsed = parseArticleDraft(malformed);
    expect(parsed?.id?.sections).toHaveLength(4);
    expect(parsed?.id?.sections.map((s) => s.h2)).toEqual(
      validLang().sections.map((s) => s.h2)
    );
  });

  it('salvage trailing comma sebelum penutup objek', () => {
    const raw = JSON.stringify({ id: validLang(), en: null });
    expect(parseArticleDraft(raw)?.id).not.toBeNull();
    expect(repairArticleJson(raw.replace(/\}$/, ',}'))).not.toBeNull();
  });
});

describe('repairArticleJson', () => {
  it('valid JSON dikembalikan tanpa diubah', () => {
    const raw = JSON.stringify({ id: validLang(), en: null });
    const repaired = repairArticleJson(raw);
    expect((repaired?.id as { slug: string })?.slug).toBe('tips-memilih-keyboard-mekanik-wfh');
  });

  it('null untuk input bukan objek / sampah', () => {
    expect(repairArticleJson('bukan json')).toBeNull();
    expect(repairArticleJson('[1,2,3]')).toBeNull();
    expect(repairArticleJson('')).toBeNull();
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

describe('auditArticleEmoji', () => {
  it('menandai excerpt dan section tanpa emoji', () => {
    const gaps = auditArticleEmoji({
      id: validLang({
        excerpt: 'Pengantar tanpa emoji sama sekali cukup panjang untuk lolos validasi parse artikel ini',
        sections: [
          { h2: 'A', body: 'Body tanpa emoji. '.repeat(30) },
          { h2: 'B', body: 'Body beremoji 🎉. '.repeat(30) }
        ]
      }),
      en: null
    });
    expect(gaps).toContainEqual({ part: 'excerpt', lang: 'id' });
    expect(gaps).toContainEqual({ part: 0, lang: 'id' });
    expect(gaps).not.toContainEqual({ part: 1, lang: 'id' });
  });

  it('kosong bila semua bagian beremoji', () => {
    const gaps = auditArticleEmoji({
      id: validLang({
        excerpt: 'Pengantar beremoji 🎉 cukup panjang untuk lolos validasi parse artikel ini ya',
        sections: [{ h2: 'A', body: 'Isi 🎉. '.repeat(30) }, { h2: 'B', body: 'Isi ✨. '.repeat(30) }, { h2: 'C', body: 'Isi 🔥. '.repeat(30) }]
      }),
      en: null
    });
    expect(gaps).toEqual([]);
  });
});

describe('clampArticleExcerpt', () => {
  const longExcerpt = Array.from({ length: 300 }, (_, i) => `kata${i}`).join(' ');

  it('excerpt pendek dibiarkan apa adanya (whitespace dinormalkan)', () => {
    expect(clampArticleExcerpt('Pengantar   singkat\nuntuk artikel')).toBe('Pengantar singkat untuk artikel');
  });

  it('clip di batas kata dan tidak pernah melebihi batas DB', () => {
    const clamped = clampArticleExcerpt(longExcerpt);
    expect(clamped.length).toBeLessThanOrEqual(ARTICLE_EXCERPT_MAX);
    expect(clamped.length).toBeGreaterThanOrEqual(50);
    expect(longExcerpt.startsWith(clamped)).toBe(true);
    expect(clamped).not.toMatch(/\s$/);
  });

  it('tidak memotong emoji di tengah (code point utuh)', () => {
    const emojiHeavy = '😀'.repeat(400);
    const clamped = clampArticleExcerpt(emojiHeavy);
    // Array.from membagi per code point → tak ada surrogate yatim.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(clamped)).toBe(false);
    expect(Array.from(clamped).every((c) => c === '😀')).toBe(true);
  });

  it('parseArticleDraft mem-clamp excerpt panjang agar DB-valid', () => {
    const parsed = parseArticleDraft(
      JSON.stringify({ id: validLang({ excerpt: longExcerpt }), en: null })
    );
    expect(parsed?.id?.excerpt.length).toBeLessThanOrEqual(ARTICLE_EXCERPT_MAX);
  });

  it('excerpt < 50 char tetap ditolak parser', () => {
    const parsed = parseArticleDraft(JSON.stringify({ id: validLang({ excerpt: 'terlalu pendek' }), en: null }));
    expect(parsed).toBeNull();
  });
});

describe('buildArticleExpandPrompt', () => {
  it('mempertahankan shape + melarang ubah slug/afiliasi', () => {
    const current = { id: validLang(), en: null };
    const { system, user } = buildArticleExpandPrompt(
      { topic: 'keyboard', language: 'id', wordCount: { id: 488 } },
      current,
      product
    );
    expect(system).toContain('EXPAND');
    expect(system).toContain('TIDAK BOLEH berubah');
    expect(system).toContain('{{PRODUCT_URL}}');
    expect(user).toContain('488');
    expect(user).toContain(JSON.stringify(current).slice(0, 50));
  });
});

describe('findAffiliateSectionIndex', () => {
  const sections = [
    { h2: 'A', body: 'Umum saja.' },
    { h2: 'B', body: 'Beli di https://s.shopee.co.id/xyz sekarang.' }
  ];
  it('ketemu index section ber-URL afiliasi', () => {
    expect(findAffiliateSectionIndex(sections, 'https://s.shopee.co.id/xyz')).toBe(1);
  });
  it('-1 bila URL kosong/tak ketemu', () => {
    expect(findAffiliateSectionIndex(sections, null)).toBe(-1);
    expect(findAffiliateSectionIndex(sections, 'https://lain.example/x')).toBe(-1);
  });
});
