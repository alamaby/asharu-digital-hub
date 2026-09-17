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

import { updateAutomationConfig } from './actions';

type Row = Record<string, unknown>;

/** Client mock: menangkap nilai `update()` agar parsing terverifikasi. */
function makeClient() {
  const patched: Row[] = [];
  return {
    patched,
    from(table: string) {
      if (table === 'automation_configs') {
        return {
          update: (patch: Row) => {
            patched.push(patch);
            return {
              eq: () => Promise.resolve({ data: null, error: null })
            };
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
});
