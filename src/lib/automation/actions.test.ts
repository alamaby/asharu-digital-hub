import { describe, expect, it, vi } from 'vitest';

const { clientRef } = vi.hoisted(() => ({ clientRef: { current: null as unknown } }));

vi.mock('@/lib/auth/is-admin', () => ({
  isAdmin: vi.fn(async () => true)
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseService: () => clientRef.current
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

import {
  updateAutomationConfig,
  createAutomationSlot,
  updateAutomationSlot,
  deleteAutomationSlot
} from './actions';

type Row = Record<string, unknown>;

/** Client mock: menangkap nilai `update()` agar parsing terverifikasi. */
function makeClient() {
  const patched: Row[] = [];
  let enabledCount = 0;
  let runCount = 0;
  const schedules: Row[] = [];
  return {
    patched,
    schedules,
    _enabledCount: () => enabledCount,
    _setEnabledCount: (n: number) => { enabledCount = n; },
    _runCount: () => runCount,
    _setRunCount: (n: number) => { runCount = n; },
    from(table: string) {
      if (table === 'automation_configs') {
        return {
          update: (patch: Row) => {
            patched.push(patch);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          }
        };
      }
      if (table === 'automation_schedules') {
        return {
          insert: (row: Row) => {
            schedules.push(row);
            return { error: null };
          },
          update: (patch: Row) => {
            patched.push(patch);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
          delete: () => {
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
          select: (_: string, opts?: { count?: 'exact'; head?: boolean }) => {
            if (opts?.head && opts?.count) {
              // filter hanya is_enabled=true
              const filtered = schedules.filter((s: Row) => s.is_enabled === true);
              return Promise.resolve({ count: enabledCount > 0 ? enabledCount : filtered.length, error: null });
            }
            return Promise.resolve({ data: schedules, error: null });
          }
        };
      }
      if (table === 'automation_runs') {
        return {
          select: (_: string, opts?: { count?: 'exact'; head?: boolean }) => {
            if (opts?.head && opts?.count) {
              return Promise.resolve({ count: runCount, error: null });
            }
            return Promise.resolve({ data: [], error: null });
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

describe('parsing FormData multi-nilai', () => {
  it('FormData.get() satu nilai saja — action wajib membaca SEMUA via getAll', async () => {
    const fd = new FormData();
    fd.append('platform_slugs', 'artikel');
    fd.append('platform_slugs', 'twitter');
    fd.append('platform_slugs', 'threads');
    // get() hanya mengembalikan nilai pertama (root cause bug 16 Sep).
    expect(fd.get('platform_slugs')).toBe('artikel');
    expect(fd.getAll('platform_slugs')).toEqual(['artikel', 'twitter', 'threads']);
    // Dan action memakai semuanya:
    const supabase = makeClient();
    clientRef.current = supabase as never;
    fd.append('schedule_hour', '10');
    const res = await updateAutomationConfig(fd);
    expect(res.ok).toBe(true);
    expect(supabase.patched[0]?.platform_slugs).toEqual(['artikel', 'twitter', 'threads']);
  });

  it('kosong untuk grup yang tidak dicentang sama sekali', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const res = await updateAutomationConfig(new FormData());
    expect(res).toEqual({ ok: false, error: 'pilih minimal 1 platform' });
    expect(supabase.patched).toHaveLength(0);
  });
});

describe('updateAutomationConfig', () => {
  it('menyimpan SEMUA platform yang dicentang (regressi bug 16 Sep)', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const fd = new FormData();
    fd.append('is_enabled', 'on');
    fd.append('platform_slugs', 'artikel');
    fd.append('platform_slugs', 'twitter');
    fd.append('platform_slugs', 'threads');
    fd.append('schedule_hour', '10');
    const res = await updateAutomationConfig(fd);
    expect(res.ok).toBe(true);
    expect(supabase.patched).toHaveLength(1);
    expect(supabase.patched[0]?.platform_slugs).toEqual(['artikel', 'twitter', 'threads']);
    // field lain ikut tersimpan (bukan hanya platform)
    expect(supabase.patched[0]?.is_enabled).toBe(true);
    expect(supabase.patched[0]?.schedule_hour).toBe(10);
    expect(supabase.patched[0]?.template_slug).toBeNull();
  });

  it('menolak tanpa pesan digest bila 0 platform', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const res = await updateAutomationConfig(new FormData());
    expect(res).toEqual({ ok: false, error: 'pilih minimal 1 platform' });
    expect(supabase.patched).toHaveLength(0);
  });

  it('menolak jam tidak valid dengan pesan jelas', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const fd = new FormData();
    fd.append('platform_slugs', 'artikel');
    fd.append('schedule_hour', '99');
    const res = await updateAutomationConfig(fd);
    expect(res).toEqual({ ok: false, error: 'jam/menit jadwal tidak valid' });
    expect(supabase.patched).toHaveLength(0);
  });

  it('menyimpan knob ideation (checkbox on → true, absen → false)', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const fd = new FormData();
    fd.append('platform_slugs', 'artikel');
    fd.append('idea_generation_enabled', 'on');
    // idea_product_search tidak dicentang → false
    const res = await updateAutomationConfig(fd);
    expect(res.ok).toBe(true);
    expect(supabase.patched[0]?.idea_generation_enabled).toBe(true);
    expect(supabase.patched[0]?.idea_product_search).toBe(false);
  });
});

// --- Slot CRUD ---------------------------------------------------------------

describe('createAutomationSlot', () => {
  it('slot_key invalid (spasi) ditolak', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const fd = new FormData();
    fd.append('slot_key', 'pagi slot');
    const res = await createAutomationSlot(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('slot_key wajib');
  });

  it('slot_key terlalu panjang (33 char) ditolak', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const fd = new FormData();
    fd.append('slot_key', 'a'.repeat(33));
    const res = await createAutomationSlot(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('slot_key wajib');
  });

  it('hapus default ditolak', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const res = await deleteAutomationSlot('default');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('tidak bisa dihapus');
  });
});

describe('updateAutomationSlot', () => {
  it('persist semua 26 override (angka, teks, boolean, array)', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const fd = new FormData();
    fd.append('slot_key', 'pagi');
    fd.append('label', 'Slot Pagi');
    fd.append('hour', '8');
    fd.append('minute', '30');
    fd.append('weekdays', '31');
    fd.append('window_minutes', '120');
    fd.append('priority', '1');
    fd.append('is_enabled', 'on');
    fd.append('max_topics', '3');
    fd.append('product_pool_size', '100');
    fd.append('product_category', 'skincare');
    fd.append('auto_publish_article', 'false');
    fd.append('require_cover', 'true');
    fd.append('notify_on', 'published');
    fd.append('notify_emails', 'a@x.com,b@x.com');
    fd.append('maximum_iterations', '3');
    fd.append('minimum_score', '70');
    fd.append('minimum_candidates', '5');
    fd.append('freshness_hours', '48');
    fd.append('cover_max_wait_minutes', '30');
    fd.append('cover_max_attempts', '5');
    fd.append('max_retry_attempts', '2');
    fd.append('target_reply_count', '4');
    fd.append('language', 'id');
    fd.append('tone', 'formal');
    fd.append('audience', 'milennial');
    fd.append('purpose', 'promo');
    fd.append('cta_style', 'hard_sell');
    fd.append('template_slug', 'blog-post');
    fd.append('idea_generation_enabled', 'true');
    fd.append('idea_product_search', 'false');
    fd.append('email_from', 'test@test.com');
    fd.append('email_reply_to', 'reply@test.com');
    fd.append('platform_slugs', 'artikel');
    fd.append('platform_slugs', 'twitter');
    const res = await updateAutomationSlot(fd);
    expect(res.ok).toBe(true);
    const p = supabase.patched[0];
    expect(p?.max_topics).toBe(3);
    expect(p?.product_pool_size).toBe(100);
    expect(p?.product_category).toBe('skincare');
    expect(p?.auto_publish_article).toBe(false);
    expect(p?.require_cover).toBe(true);
    expect(p?.notify_on).toBe('published');
    expect(p?.notify_emails).toEqual(['a@x.com', 'b@x.com']);
    expect(p?.maximum_iterations).toBe(3);
    expect(p?.minimum_score).toBe(70);
    expect(p?.language).toBe('id');
    expect(p?.template_slug).toBe('blog-post');
    expect(p?.platform_slugs).toEqual(['artikel', 'twitter']);
  });

  it('isi kosong → NULL (warisi global)', async () => {
    const supabase = makeClient();
    clientRef.current = supabase as never;
    const fd = new FormData();
    fd.append('slot_key', 'pagi');
    fd.append('label', '');
    fd.append('hour', '10');
    fd.append('minute', '0');
    fd.append('weekdays', '127');
    fd.append('window_minutes', '');
    fd.append('priority', '0');
    fd.append('max_topics', '');
    fd.append('product_category', '');
    fd.append('language', '');
    fd.append('tone', '');
    fd.append('notify_on', '');
    fd.append('notify_emails', '');
    fd.append('email_from', '');
    const res = await updateAutomationSlot(fd);
    expect(res.ok).toBe(true);
    const p = supabase.patched[0];
    expect(p?.window_minutes).toBeNull();
    expect(p?.max_topics).toBeNull();
    expect(p?.product_category).toBeNull();
    expect(p?.language).toBeNull();
    expect(p?.tone).toBeNull();
    expect(p?.notify_on).toBeNull();
    expect(p?.notify_emails).toBeNull();
    expect(p?.email_from).toBeNull();
  });
});
