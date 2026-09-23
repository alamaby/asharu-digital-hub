import { describe, expect, it } from 'vitest';
import {
  ARTICLE_EXCERPT_MAX,
  ARTICLE_MIN_WORDS,
  auditArticleEmoji,
  buildArticleExpandPrompt,
  buildArticlePrompt,
  CJK_RE,
  clampArticleExcerpt,
  countArticleWords,
  findAffiliateSectionIndex,
  findCjkHit,
  isValidCoverPrompt,
  debugArticleRejectReason,
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

describe('isValidCoverPrompt', () => {
  it('mengizinkan string valid 10–500 char Latin', () => {
    const ok = 'a'.repeat(10);
    expect(isValidCoverPrompt(ok)).toBe(true);
    const long = 'x'.repeat(500);
    expect(isValidCoverPrompt(long)).toBe(true);
  });

  it('menolak string < 10 char', () => {
    expect(isValidCoverPrompt('')).toBe(false);
    expect(isValidCoverPrompt('    ')).toBe(false);
    expect(isValidCoverPrompt('abcd')).toBe(false);
  });

  it('menolak string > 500 char', () => {
    expect(isValidCoverPrompt('a'.repeat(501))).toBe(false);
  });

  it('menolak CJK', () => {
    expect(isValidCoverPrompt('short 中文 ones')).toBe(false);
    expect(isValidCoverPrompt('short valid ones')).toBe(true); // Latin OK
  });

  it('menolak non-string', () => {
    expect(isValidCoverPrompt(null)).toBe(false);
    expect(isValidCoverPrompt(undefined)).toBe(false);
    expect(isValidCoverPrompt(123)).toBe(false);
    expect(isValidCoverPrompt({})).toBe(false);
  });
});

describe('parseArticleDraft cover_image_prompt', () => {
  const base = JSON.stringify({ id: validLang(), en: null });

  it('accept top-level cover_image_prompt dan menyimpannya', () => {
    // base: {"id":{...},"en":null} — perlu ditambahkan field di dalam kurung kurawal terakhir.
    const raw = '{"id":' + JSON.stringify(validLang()) + ',"en":null,"cover_image_prompt":"a nice indoor scene with soft lighting"}';
    const parsed = parseArticleDraft(raw);
    expect(parsed?.cover_image_prompt).toBe('a nice indoor scene with soft lighting');
  });

  it('toleran bila field tidak ada (fallback ke undefined)', () => {
    const parsed = parseArticleDraft(base);
    expect(parsed?.cover_image_prompt).toBeUndefined();
  });

  it('toleran bila field bukan string (undefined, tidak gagalkan parse)', () => {
    const raw = '{"id":' + JSON.stringify(validLang()) + ',"en":null,"cover_image_prompt":123}';
    const parsed = parseArticleDraft(raw);
    expect(parsed?.cover_image_prompt).toBeUndefined();
    // Parse tetap sukses selama id/en valid.
    expect(parsed?.id).not.toBeNull();
  });

  it('menyimpan trim spasi ekstra di sekitar value', () => {
    const raw = '{"id":' + JSON.stringify(validLang()) + ',"en":null,"cover_image_prompt":"   bright daylight, cozy room   "}';
    const parsed = parseArticleDraft(raw);
    expect(parsed?.cover_image_prompt).toBe('bright daylight, cozy room');
  });
});

describe('CJK gate (M1)', () => {
  it('findCjkHit mengembalikan karakter CJK pertama atau null', () => {
    expect(findCjkHit('halo dunia')).toBeNull();
    expect(findCjkHit('panas 散热 bagus')).toBe('散');
    expect(findCjkHit('close 关闭')).toBe('关');
  });

  it('CJK_RE cocok untuk karakter Cina/Jepang/Korea', () => {
    expect(CJK_RE.test('散热')).toBe(true);
    expect(CJK_RE.test('关闭')).toBe(true);
    expect(CJK_RE.test('夹式')).toBe(true);
    expect(CJK_RE.test('团战')).toBe(true);
    expect(CJK_RE.test('abc')).toBe(false);
  });

  it('parseArticleDraft menolak body section yang memuat CJK (散热)', () => {
    const bad = validLang({
      sections: [
        { h2: 'Bagian Satu', body: 'Isi tentang pelepasan panas (散热) dan lainnya.'.repeat(30) },
        { h2: 'Bagian Dua', body: 'Isi bagian dua yang valid.'.repeat(30) },
        { h2: 'Bagian Tiga', body: 'Isi bagian tiga yang valid.'.repeat(30) }
      ]
    });
    expect(parseArticleDraft(JSON.stringify({ id: bad, en: null }))).toBeNull();
  });

  it('parseArticleDraft menolak FAQ answer yang memuat CJK (夹式)', () => {
    const bad = validLang({
      faq: [{ q: 'Apakah aman?', a: 'Ya, model 夹式 sangat aman digunakan.' }]
    });
    // Tambah section agar >= 3
    bad.sections.push({ h2: 'X', body: 'Y'.repeat(200) });
    bad.sections.push({ h2: 'Z', body: 'W'.repeat(200) });
    expect(parseArticleDraft(JSON.stringify({ id: bad, en: null }))).toBeNull();
  });

  it('buildArticlePrompt system memuat larangan keras CJK', () => {
    const { system } = buildArticlePrompt(
      { topic: 'keyboard', tone: 'casual', audience: 'pekerja', ctaStyle: 'soft_sell', purpose: 'edukasi', language: 'id' },
      product
    );
    expect(system).toContain('DILARANG keras karakter CJK');
    expect(system).toContain('散热');
  });

  it('buildArticleExpandPrompt system juga memuat larangan keras CJK', () => {
    const current = { id: validLang(), en: null };
    const { system } = buildArticleExpandPrompt(
      { topic: 'keyboard', language: 'id', wordCount: { id: 400 } },
      current as unknown as import('./prompt').ParsedArticleDraft,
      product
    );
    expect(system).toContain('DILARANG keras karakter CJK');
  });
});
describe('debugArticleRejectReason', () => {
  it('null input → top-level JSON bukan objek', () => {
    expect(debugArticleRejectReason(null)).toContain('top-level JSON bukan objek');
  });
  it('title kosong → menolak di title', () => {
    const raw = { id: { slug: 'a', excerpt: 'x'.repeat(60), sections: [{ h2: 'A', body: 'b'.repeat(100) }, { h2: 'B', body: 'c'.repeat(100) }, { h2: 'C', body: 'd'.repeat(100) }], faq: [], meta_title: 't', meta_desc: 'm' }, en: null };
    delete (raw.id as Record<string, unknown>).title;
    expect(debugArticleRejectReason(raw)).toContain('title');
  });
  it('slug tak valid → menolak di slug', () => {
    const raw = { id: { title: 'Judul', slug: 'Slug Buruk!!', excerpt: 'x'.repeat(60), sections: [{ h2: 'A', body: 'b'.repeat(100) }, { h2: 'B', body: 'c'.repeat(100) }, { h2: 'C', body: 'd'.repeat(100) }], faq: [], meta_title: 't', meta_desc: 'm' }, en: null };
    expect(debugArticleRejectReason(raw)).toContain('slug');
  });
  it('excerpt pendek → menolak di excerpt', () => {
    const raw = { id: { title: 'Judul', slug: 'judul-valid', excerpt: 'pendek', sections: [{ h2: 'A', body: 'b'.repeat(100) }, { h2: 'B', body: 'c'.repeat(100) }, { h2: 'C', body: 'd'.repeat(100) }], faq: [], meta_title: 't', meta_desc: 'm' }, en: null };
    expect(debugArticleRejectReason(raw)).toContain('excerpt');
  });
  it('sections < 3 → menolak di sections', () => {
    const raw = { id: { title: 'Judul', slug: 'judul-valid', excerpt: 'x'.repeat(60), sections: [{ h2: 'A', body: 'b'.repeat(100) }], faq: [], meta_title: 't', meta_desc: 'm' }, en: null };
    expect(debugArticleRejectReason(raw)).toContain('sections');
  });
  it('CJK di section body → menolak di CJK', () => {
    const raw = { id: { title: 'Judul', slug: 'judul-valid', excerpt: 'x'.repeat(60), sections: [{ h2: 'Bagian 散热', body: 'isi'.repeat(30) }, { h2: 'B', body: 'c'.repeat(100) }, { h2: 'C', body: 'd'.repeat(100) }], faq: [], meta_title: 't', meta_desc: 'm' }, en: null };
    expect(debugArticleRejectReason(raw)).toContain('CJK');
  });
  it('semua valid → semua field valid', () => {
    const raw = { id: validLang(), en: null };
    expect(debugArticleRejectReason(raw)).toContain('semua field valid');
  });
  it('kedua bahasa null → pesan "butuh minimal satu bahasa"', () => {
    expect(debugArticleRejectReason({ id: null, en: null })).toContain('kedua bahasa null');
    expect(debugArticleRejectReason({ id: null, en: null })).not.toContain('semua field valid');
  });
  it('hanya en null, id null → pesan "butuh minimal satu bahasa"', () => {
    expect(debugArticleRejectReason({ id: null, en: null as unknown as ArticleLangDraft })).toContain('kedua bahasa null');
  });
  it('id null tapi en valid → tidak menyebut "kedua bahasa null"', () => {
    const raw = { id: null, en: validLang() };
    expect(debugArticleRejectReason(raw)).not.toContain('kedua bahasa null');
  });
});

