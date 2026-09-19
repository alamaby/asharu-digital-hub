import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateArticleDraft, rejectArticleDraft, resetArticleApproval, updatePublishedArticle } from './actions';

// Hoisted mocks
const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({ get revalidatePath() { return revalidatePathMock; } }));

const isAdminMock = vi.fn(() => Promise.resolve(true));
vi.mock('@/lib/auth/is-admin', () => ({ get isAdmin() { return isAdminMock; } }));

let svcClient: ReturnType<typeof makeMockClient> | null = null;
vi.mock('@/lib/supabase/server', () => ({
  get createSupabaseService() {
    return () => svcClient;
  }
}));

type Row = Record<string, unknown>;

/** Minimal mock client — cukup untuk test actions artikel */
function makeMockClient(tables: Record<string, Row[]>) {
  const clone = (rows: Row[]) => rows.map((r) => ({ ...r }));
  return {
    from(table: string) {
      let rows = clone(tables[table] ?? []);
      let mutation: ((r: Row) => Row) | null = null;
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
        select: () => builder,
        eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return builder; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        insert: (payload: Row | Row[]) => {
          const list = Array.isArray(payload) ? payload : [payload];
          tables[table] = [...(tables[table] ?? []), ...list.map((p) => ({ id: `gen-${Math.random().toString(36).slice(2, 8)}`, ...p }))];
          return {
            select: () => ({ single: async () => ({ data: null, error: null }) }),
            then: (resolve: (v: unknown) => unknown) => resolve({ data: list, error: null })
          };
        },
        update: (patch: Row) => {
          mutation = (r: Row) => ({ ...r, ...patch });
          const apply = () => {
            if (mutation) {
              tables[table] = (tables[table] ?? []).map((r) =>
                rows.some((x) => (x.id as string) === (r.id as string)) ? mutation!(r) : r
              );
              mutation = null;
            }
          };
          return {
            eq: (col: string, val: unknown) => {
              rows = rows.filter((r) => r[col] === val);
              return {
                eq: (col2: string, val2: unknown) => { rows = rows.filter((r) => r[col2] === val2); apply(); return { select: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }) }; },
                select: () => ({ maybeSingle: async () => { apply(); return { data: rows[0] ?? null, error: null }; } }),
                then: (resolve: (v: unknown) => unknown) => { apply(); return resolve({ data: null, error: null }); }
              };
            },
            select: () => ({ maybeSingle: async () => { apply(); return { data: rows[0] ?? null, error: null }; } })
          };
        }
      });
      return builder as never;
    }
  };
}

function buildDraftTable(draftRow: Row) {
  return makeMockClient({
    content_drafts: [draftRow],
    articles: []
  });
}

function validDraft(articleJson: Record<string, unknown>): Row {
  return {
    id: 'draft-001',
    platform_slug: 'artikel',
    // Supabase JSON kolom → return sebagai object, bukan string
    article_draft: articleJson,
    research_topic_id: null,
    llm_meta: null,
    status: 'needs_review'
  };
}

function validArticleRow(overrides: Row = {}): Row {
  return {
    id: 'art-001',
    draft_id: 'draft-001',
    locale: 'id',
    slug: 'tips-keyboard-wfh',
    status: 'published',
    ...overrides
  };
}

describe('updateArticleDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminMock.mockResolvedValue(true);
    svcClient = null;
  });

  it('tolak non-admin', async () => {
    isAdminMock.mockResolvedValue(false);
    svcClient = makeMockClient({});
    const res = await updateArticleDraft('d', { locale: 'id', title: 'New Title' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('forbidden');
  });

  it('tolak CJK di judul', async () => {
    const draft = validDraft({
      id: {
        title: 'Keyboard Mekanik Guide',
        slug: 'tips-keyboard-wfh',
        excerpt: 'Panduan lengkap memilih keyboard mekanik untuk kerja dari rumah.',
        sections: [
          { h2: 'Switch yang cocok', body: 'Switch mekanik memiliki rasa ketikan berbeda.'.repeat(30) },
          { h2: 'Ukuran layout', body: 'Layout menentukan ruang meja.'.repeat(30) },
          { h2: 'Anggaran', body: 'Tentukan budget dulu.'.repeat(30) }
        ],
        faq: [{ q: 'Apakah berisik?', a: 'Tergantung switch.' }],
        meta_title: 'Keyboard Mekanik',
        meta_desc: 'Panduan keyboard.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      title: 'Pan生热 guide' // contains CJK
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('judul');
    expect(res.error).toContain('生');
  });

  it('tolak CJK di body section', async () => {
    const draft = validDraft({
      id: {
        title: 'Keyboard Mekanik Guide',
        slug: 'tips-keyboard-wfh',
        excerpt: 'Panduan lengkap memilih keyboard mekanik untuk kerja dari rumah.',
        sections: [
          { h2: 'Switch yang cocok', body: 'Body text about mechanical switches here.'.repeat(30) },
          { h2: 'Ukuran layout', body: 'Layout determines desk space.'.repeat(30) },
          { h2: 'Anggaran', body: 'Set budget first.'.repeat(30) }
        ],
        faq: [{ q: 'Apakah berisik?', a: 'Tergantung switch.' }],
        meta_title: 'Keyboard Mekanik',
        meta_desc: 'Panduan keyboard.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      sections: [
        { h2: 'Switch baru', body: 'Panas 散热 adalah topik.' },
        { h2: 'Ukuran', body: 'Layout info.' },
        { h2: 'Budget', body: 'Anggaran.' }
      ]
    });
    expect(res.success).toBe(false);
    // Pesan presisi: nomor section + karakter pelanggar (kasus 36bb2945).
    expect(res.error).toContain('Section 1');
    expect(res.error).toContain('散');
  });

  it('tolak CJK di meta_title dengan pesan presisi', async () => {
    const draft = validDraft({
      id: {
        title: 'Keyboard Mekanik Guide',
        slug: 'tips-keyboard-wfh',
        excerpt: 'Panduan lengkap memilih keyboard mekanik untuk kerja dari rumah.',
        sections: [
          { h2: 'A', body: 'Body A content here.'.repeat(30) },
          { h2: 'B', body: 'Body B content here.'.repeat(30) },
          { h2: 'C', body: 'Body C content here.'.repeat(30) }
        ],
        faq: [{ q: 'Q?', a: 'A.' }],
        meta_title: 'KB Guide',
        meta_desc: 'Panduan.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      meta_title: 'Panduan 散热 keyboard'
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('meta_title');
    expect(res.error).toContain('散');
  });

  it('tolak CJK di FAQ jawaban dengan nomor FAQ presisi', async () => {
    const draft = validDraft({
      id: {
        title: 'Keyboard Mekanik Guide',
        slug: 'tips-keyboard-wfh',
        excerpt: 'Panduan lengkap memilih keyboard mekanik untuk kerja dari rumah.',
        sections: [
          { h2: 'A', body: 'Body A content here.'.repeat(30) },
          { h2: 'B', body: 'Body B content here.'.repeat(30) },
          { h2: 'C', body: 'Body C content here.'.repeat(30) }
        ],
        faq: [{ q: 'Q?', a: 'A.' }, { q: 'Q2?', a: 'A2.' }],
        meta_title: 'KB Guide',
        meta_desc: 'Panduan.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      faq: [{ q: 'Q?', a: 'A.' }, { q: 'Q2?', a: 'Jawaban 夹式 di sini.' }]
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('FAQ #2');
    expect(res.error).toContain('夹');
  });

  it('tolak slug tidak valid', async () => {
    const draft = validDraft({
      id: {
        title: 'Keyboard Mekanik Guide',
        slug: 'tips-keyboard-wfh',
        excerpt: 'Panduan lengkap memilih keyboard mekanik untuk kerja dari rumah.',
        sections: [
          { h2: 'A', body: 'Body A content here.'.repeat(30) },
          { h2: 'B', body: 'Body B content here.'.repeat(30) },
          { h2: 'C', body: 'Body C content here.'.repeat(30) }
        ],
        faq: [{ q: 'Q?', a: 'A.' }],
        meta_title: 'KB Guide',
        meta_desc: 'Panduan.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      slug: 'Slug Buruk!!'
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('validasi');
  });

  it('tolak section kurang dari 3', async () => {
    const draft = validDraft({
      id: {
        title: 'Keyboard Guide',
        slug: 'tips-keyboard',
        excerpt: 'Panduan memilih keyboard.',
        sections: [
          { h2: 'A', body: 'Body A content here.'.repeat(30) },
          { h2: 'B', body: 'Body B content here.'.repeat(30) }
        ],
        faq: [],
        meta_title: 'KB',
        meta_desc: 'Panduan.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    // Try to reduce to 2 sections
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      sections: [
        { h2: 'A', body: 'Body A content here.'.repeat(30) },
        { h2: 'B', body: 'Body B content here.'.repeat(30) }
      ]
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('validasi');
  });

  it('sukses update title + slug tanpa CJK', async () => {
    const draft = validDraft({
      id: {
        title: 'Keyboard Mekanik Guide',
        slug: 'tips-keyboard-wfh',
        excerpt: 'Panduan lengkap memilih keyboard mekanik untuk kerja dari rumah.',
        sections: [
          { h2: 'Switch', body: 'Switch mekanik enak digunakan.'.repeat(30) },
          { h2: 'Layout', body: 'Layout 60% hemat tempat.'.repeat(30) },
          { h2: 'Budget', body: 'Mulai 500rb sudah dapat.'.repeat(30) }
        ],
        faq: [{ q: 'Berisik?', a: 'Tidak.' }],
        meta_title: 'KB Guide',
        meta_desc: 'Panduan keyboard.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      title: 'Keyboard Mekanik Terbaru',
      slug: 'keyboard-mekanik-terbaru'
    });
    expect(res.success).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it('excerpt panjang di-clamp otomatis', async () => {
    const longExcerpt = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const draft = validDraft({
      id: {
        title: 'Keyboard Guide',
        slug: 'kb-guide',
        excerpt: longExcerpt,
        sections: [
          { h2: 'A', body: 'Body A content here.'.repeat(30) },
          { h2: 'B', body: 'Body B content here.'.repeat(30) },
          { h2: 'C', body: 'Body C content here.'.repeat(30) }
        ],
        faq: [],
        meta_title: 'KB',
        meta_desc: 'Panduan.'
      },
      en: null
    });
    svcClient = buildDraftTable(draft);
    const res = await updateArticleDraft('draft-001', {
      locale: 'id',
      excerpt: longExcerpt + ' extra words that exceed limit'
    });
    expect(res.success).toBe(true);
  });
});

describe('rejectArticleDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminMock.mockResolvedValue(true);
    svcClient = null;
  });

  it('tolak non-admin', async () => {
    isAdminMock.mockResolvedValue(false);
    svcClient = makeMockClient({});
    const res = await rejectArticleDraft('draft-001');
    expect(res.success).toBe(false);
    expect(res.error).toBe('forbidden');
  });

  it('sukses set status rejected + revalidate', async () => {
    const draft = { id: 'draft-001', status: 'needs_review' };
    svcClient = buildDraftTable(draft);
    const res = await rejectArticleDraft('draft-001');
    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});

describe('resetArticleApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminMock.mockResolvedValue(true);
    svcClient = null;
  });

  it('tolak non-admin', async () => {
    isAdminMock.mockResolvedValue(false);
    svcClient = makeMockClient({});
    const res = await resetArticleApproval('draft-001');
    expect(res.success).toBe(false);
    expect(res.error).toBe('forbidden');
  });

  it('sukses set status needs_review', async () => {
    const draft = { id: 'draft-001', status: 'rejected' };
    svcClient = buildDraftTable(draft);
    const res = await resetArticleApproval('draft-001');
    expect(res.success).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});

describe('updatePublishedArticle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminMock.mockResolvedValue(true);
    svcClient = null;
  });

  it('tolak non-admin', async () => {
    isAdminMock.mockResolvedValue(false);
    svcClient = makeMockClient({});
    const res = await updatePublishedArticle('art-001', { slug: 'new-slug' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('forbidden');
  });

  it('tolak CJK di judul', async () => {
    const article = validArticleRow({ id: 'art-001', slug: 'old-slug', status: 'published' });
    svcClient = buildDraftTable({ id: 'draft-001', platform_slug: 'artikel', article_draft: '{}', status: 'needs_review' });
    // Need articles table too
    const mock = makeMockClient({
      content_drafts: [{ id: 'draft-001', platform_slug: 'artikel', article_draft: '{}', status: 'needs_review' }],
      articles: [article]
    });
    svcClient = mock;
    const res = await updatePublishedArticle('art-001', { title: 'Pan生热 Guide' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('CJK');
  });

  it('tolak slug tidak valid', async () => {
    const article = validArticleRow({ id: 'art-001', slug: 'old-slug', status: 'published' });
    const mock = makeMockClient({
      content_drafts: [{ id: 'draft-001', platform_slug: 'artikel', article_draft: '{}', status: 'needs_review' }],
      articles: [article]
    });
    svcClient = mock;
    const res = await updatePublishedArticle('art-001', { slug: 'Bad Slug!!' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('slug tidak valid');
  });

  it('sukses update slug published article', async () => {
    const article = validArticleRow({ id: 'art-001', slug: 'old-slug', status: 'published' });
    const mock = makeMockClient({
      content_drafts: [{ id: 'draft-001', platform_slug: 'artikel', article_draft: '{}', status: 'needs_review' }],
      articles: [article]
    });
    svcClient = mock;
    const res = await updatePublishedArticle('art-001', { slug: 'new-valid-slug' });
    expect(res.success).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it('tolak CJK di FAQ answer', async () => {
    const article = validArticleRow({ id: 'art-001', slug: 'old-slug', status: 'published' });
    const mock = makeMockClient({
      content_drafts: [{ id: 'draft-001', platform_slug: 'artikel', article_draft: '{}', status: 'needs_review' }],
      articles: [article]
    });
    svcClient = mock;
    const res = await updatePublishedArticle('art-001', {
      faq: [{ q: 'Soal apa?', a: 'Jawaban 团战 di sini' }]
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('CJK');
  });
});
