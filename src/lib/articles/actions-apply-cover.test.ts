import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDraftCoverToArticle } from './actions';

// Hoisted mocks — harus sebelum import actions.ts.
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

/** Mock client ala runner.test.ts — setiap from(table) meniru state tabel terkini. */
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
                rows.some((x) => x.id === r.id) ? mutation!(r) : r
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

interface BuildOpts {
  imageStatus?: string;
  imagePublicUrl?: string | null;
  imageDraftId?: string;
  isAdmin?: boolean;
  articleCount?: number;
  /** Override gambar cover (hanya dipakai untuk test post_index/status URL khusus). */
  overrideImage?: Row;
}

function buildTables(opts: BuildOpts = {}): { tables: Record<string, Row[]>; imgId: string; draftId: string } {
  const tables: Record<string, Row[]> = {};
  const imgId = 'img-abc123';
  const draftId = opts.imageDraftId ?? 'draft-xyz';
  const images: Row[] = [opts.overrideImage ?? {
    id: imgId,
    draft_id: draftId,
    post_index: 0,
    status: opts.imageStatus ?? 'selected',
    public_url: opts.imagePublicUrl ?? 'https://example.com/cover.jpg',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }];
  const articles: Row[] = Array.from({ length: opts.articleCount ?? 2 }, (_, i) => ({
    id: `art-${i}`,
    draft_id: draftId,
    locale: i === 0 ? 'id' : 'en',
    slug: `test-artikel-${i}`,
    cover_image_url: 'https://old.example/c.jpg',
    status: 'published' // artikel published perlu status column agar query .eq('status','published') cocok
  }));
  tables['content_draft_images'] = images;
  tables['articles'] = articles;
  tables['content_research_logs'] = [];
  isAdminMock.mockResolvedValue(opts.isAdmin ?? true);
  svcClient = makeMockClient(tables);
  return { tables, imgId, draftId };
}

describe('applyDraftCoverToArticle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revalidatePathMock.mockClear();
    svcClient = null;
  });

  it('tolak non-admin', async () => {
    buildTables({ isAdmin: false });
    const res = await applyDraftCoverToArticle('d', 'i');
    expect(res.success).toBe(false);
    expect(res.error).toBe('forbidden');
  });

  it('tolak draftId/draftImageId kosong', async () => {
    buildTables();
    expect((await applyDraftCoverToArticle('', 'i')).success).toBe(false);
    expect((await applyDraftCoverToArticle('d', '')).success).toBe(false);
  });

  it('tolak image tidak ditemukan', async () => {
    // Client dengan tabel gambar kosong → query return null → tidak ditemukan.
    const fresh = makeMockClient({ content_draft_images: [], articles: [{ id: 'a', draft_id: 'd', locale: 'id', slug: 's', cover_image_url: '', status: 'published' }], content_research_logs: [] });
    svcClient = fresh;
    const r = await applyDraftCoverToArticle('d', 'missing-img-id');
    expect(r.success).toBe(false);
    expect(r.error).toContain('tidak ditemukan');
  });

  it('tolak image milik draf lain', async () => {
    buildTables({ imageDraftId: 'other-draft' });
    const r = await applyDraftCoverToArticle('my-draft', 'img-abc123');
    expect(r.success).toBe(false);
    expect(r.error).toBe('gambar bukan milik draf ini');
  });

  it('tolak post_index != 0', async () => {
    // Gambar dengan post_index=1; artikel tetap ada agar error post_index yang muncul dulu.
    buildTables({
      overrideImage: {
        id: 'img-abc123',
        draft_id: 'draft-xyz',
        post_index: 1,
        status: 'selected',
        public_url: 'https://example.com/c.jpg',
        created_at: '',
        updated_at: ''
      }
    });
    const r = await applyDraftCoverToArticle('draft-xyz', 'img-abc123');
    expect(r.success).toBe(false);
    expect(r.error).toBe('hanya cover (post 0) yang bisa diterapkan');
  });

  it('tolak status pending/prompt_ready/failed', async () => {
    for (const st of ['pending', 'prompt_ready', 'failed'] as const) {
      buildTables({ imageStatus: st });
      const r = await applyDraftCoverToArticle('draft-xyz', 'img-abc123');
      expect(r.success).toBe(false);
      expect(r.error).toBe('gambar belum jadi — generate dulu sampai ready');
    }
  });

  it('tolak public_url kosong', async () => {
    // Gunakan overrideImage agar mock konsisten (menghindari race state).
    buildTables({
      overrideImage: {
        id: 'img-abc123',
        draft_id: 'draft-xyz',
        post_index: 0,
        status: 'selected',
        public_url: null,
        created_at: '',
        updated_at: ''
      }
    });
    const r = await applyDraftCoverToArticle('draft-xyz', 'img-abc123');
    expect(r.success).toBe(false);
    expect(r.error).toBe('gambar belum punya URL publik');
  });

  it('tolak tanpa artikel published', async () => {
    buildTables({ articleCount: 0 });
    const r = await applyDraftCoverToArticle('draft-xyz', 'img-abc123');
    expect(r.success).toBe(false);
    expect(r.error).toBe('draf ini belum punya artikel terbit');
  });

  it('sukses 2 locale: update cover_image_url + updated_at; kembalikan updatedLocales', async () => {
    const { tables, imgId, draftId } = buildTables();
    expect(imgId).toBe('img-abc123');
    expect(draftId).toBe('draft-xyz');
    const res = await applyDraftCoverToArticle(draftId, imgId);
    expect(res.success).toBe(true);
    expect(res.updatedLocales?.sort()).toEqual(['id', 'en'].sort());
    for (const a of (tables['articles'] ?? [])) {
      expect(a.cover_image_url).toBe('https://example.com/cover.jpg');
      expect(typeof (a.updated_at as string)).toBe('string');
    }
    expect(tables['content_research_logs']).toHaveLength(1);
    expect(tables['content_research_logs']![0]?.stage).toBe('cover_apply');
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});
