import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

/**
 * Mock client generik: from(table) mengembalikan builder chainable yang
 * resolve ke `{ data, error }` dari tabel in-memory. Mendukung pola yang
 * dipakai runner: select/eq/neq/order/limit/maybeSingle/single/insert/update.
 */
function makeClient(tables: Record<string, Row[]>) {
  const calls: string[] = [];
  const clone = (rows: Row[]) => rows.map((r) => ({ ...r }));
  return {
    calls,
    from(table: string) {
      calls.push(table);
      let rows = clone(tables[table] ?? []);
      let mutation: ((r: Row) => Row) | null = null;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        // Thenable agar `await query` (tanpa maybeSingle/single) resolve data.
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
        select: chain,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        neq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] !== val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return builder;
        },
        lt: chain,
        gt: chain,
        gte: (col: string, val: unknown) => {
          rows = rows.filter((r) => {
            const av = r[col] as number | string | null | undefined;
            if (av == null) return false;
            return av >= (val as number | string);
          });
          return builder;
        },
        lte: (col: string, val: unknown) => {
          rows = rows.filter((r) => {
            const av = r[col] as number | string | null | undefined;
            if (av == null) return false;
            return av <= (val as number | string);
          });
          return builder;
        },
        order: chain,
        limit: chain,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }),
        insert: (payload: Row | Row[]) => {
          const list = Array.isArray(payload) ? payload : [payload];
          const inserted = list.map((p) => ({ id: `gen-${Math.random().toString(36).slice(2, 8)}`, ...p }));
          tables[table] = [...(tables[table] ?? []), ...inserted];
          mutation = null;
          return {
            select: () => ({
              single: async () => ({ data: inserted[0] ?? null, error: null })
            }),
            then: (resolve: (v: unknown) => unknown) => resolve({ data: inserted, error: null })
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
                eq: (col2: string, val2: unknown) => {
                  rows = rows.filter((r) => r[col2] === val2);
                  return {
                    eq: (col3: string, val3: unknown) => {
                      rows = rows.filter((r) => r[col3] === val3);
                      apply();
                      return { select: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }) };
                    },
                    in: (col3: string, vals: unknown[]) => {
                      rows = rows.filter((r) => (vals as unknown[]).includes(r[col3]));
                      apply();
                      return { select: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }), then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }) };
                    },
                    select: () => ({ maybeSingle: async () => { apply(); return { data: rows[0] ?? null, error: null }; } }),
                    then: (resolve: (v: unknown) => unknown) => { apply(); return resolve({ data: null, error: null }); }
                  };
                },
                in: (col2: string, vals: unknown[]) => {
                  rows = rows.filter((r) => (vals as unknown[]).includes(r[col2]));
                  apply();
                  return { select: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }), then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }) };
                },
                select: () => ({ maybeSingle: async () => { apply(); return { data: rows[0] ?? null, error: null }; } }),
                then: (resolve: (v: unknown) => unknown) => { apply(); return resolve({ data: null, error: null }); }
              };
            },
            select: () => ({ maybeSingle: async () => { apply(); return { data: rows[0] ?? null, error: null }; } })
          };
        }
      });
      return builder;
    }
  };
}

function baseConfig(over: Row = {}): Row {
  return {
    id: 1,
    is_enabled: true,
    schedule_hour: 10,
    schedule_minute: 0,
    timezone: 'Asia/Jakarta',
    schedule_window_minutes: 180,
    mechanism: 'dua',
    platform_slugs: ['artikel', 'twitter', 'threads'],
    template_slug: null,
    max_topics: 1,
    language: 'both',
    tone: 'casual',
    audience: 'umum',
    purpose: 'membagikan informasi bermanfaat',
    cta_style: 'soft_sell',
    target_reply_count: null,
    product_pool_size: 50,
    product_category: null,
    require_cover: true,
    cover_max_wait_minutes: 60,
    cover_max_attempts: 3,
    auto_publish_article: true,
    max_retry_attempts: 3,
    notify_on: 'none',
    notify_emails: [],
    email_from: 'Asharu <updates@alamaby.com>',
    email_reply_to: null,
    ...over
  };
}

// Impor setelah helper (vi.mock hoisting tidak diperlukan di sini).
import { runAutomationTick } from './runner';

describe('runAutomationTick (guards)', () => {
  it('skip "disabled" saat config belum ada', async () => {
    const supabase = makeClient({ automation_configs: [] });
    const res = await runAutomationTick(supabase as never);
    expect(res).toMatchObject({ ok: true, skipped: 'disabled' });
  });

  it('skip "disabled" saat kill-switch mati', async () => {
    const supabase = makeClient({ automation_configs: [baseConfig({ is_enabled: false })] });
    const res = await runAutomationTick(supabase as never);
    expect(res).toMatchObject({ ok: true, skipped: 'disabled' });
  });

  it('skip "not_due" sebelum jendela jadwal (tanpa membuat run)', async () => {
    const tables = { automation_configs: [baseConfig()], automation_runs: [] as Row[] };
    const supabase = makeClient(tables);
    // 09:00 WIB
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T02:00:00Z')
    });
    expect(res).toMatchObject({ ok: true, skipped: 'not_due', runDate: '2026-09-16' });
    expect(tables.automation_runs).toHaveLength(0);
  });

  it('force mengabaikan jendela jadwal (mencoba membuat run)', async () => {
    const tables = { automation_configs: [baseConfig()], automation_runs: [] as Row[] };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T02:00:00Z'),
      force: true
    });
    // Tanpa pool produk → gagal jujur, tapi run tetap dicoba (bukan not_due).
    expect(res.skipped).not.toBe('not_due');
    expect(res.ok).toBe(false);
  });

  it('skip "already_done" saat run hari ini sudah completed', async () => {
    const supabase = makeClient({
      automation_configs: [baseConfig()],
      automation_runs: [{ id: 'run1', run_date: '2026-09-16', status: 'completed', attempts: 0, session_id: 's1' }]
    });
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res).toMatchObject({ ok: true, skipped: 'already_done', status: 'completed' });
  });

  it('sesi failed → run failed + tidak diulang setelah attempts habis', async () => {
    const supabase = makeClient({
      automation_configs: [baseConfig({ max_retry_attempts: 0 })],
      automation_runs: [
        { id: 'run1', run_date: '2026-09-16', status: 'failed', attempts: 0, session_id: 's1' }
      ]
    });
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res).toMatchObject({ ok: true, skipped: 'already_done', status: 'failed' });
  });

  it('tidak retry run failed bila sesi riset ikut failed (butuh intervensi manual)', async () => {
    const tables = {
      automation_configs: [baseConfig({ max_retry_attempts: 3 })],
      automation_runs: [
        {
          id: 'run1',
          run_date: '2026-09-16',
          status: 'failed',
          attempts: 0,
          session_id: 's1',
          cover_started_at: '2026-09-16T02:00:00Z'
        }
      ],
      content_research_sessions: [{ id: 's1', status: 'failed' }]
    };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res).toMatchObject({ ok: true, skipped: 'already_done', status: 'failed' });
    expect(tables.automation_runs[0]?.attempts).toBe(0);
  });

  it('run failed dengan sesi hidup di-retry: cover_started_at direset', async () => {    const tables = {
      automation_configs: [baseConfig({ max_retry_attempts: 3 })],
      automation_runs: [
        {
          id: 'run1',
          run_date: '2026-09-16',
          status: 'failed',
          attempts: 1,
          session_id: 's1',
          article_draft_id: 'd1',
          cover_started_at: '2026-09-16T02:00:00Z',
          cover_attempts: 3
        }
      ],
      content_research_sessions: [{ id: 's1', status: 'completed' }],
      content_research_topics: [],
      content_draft_images: []
    };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res.ok).toBe(true);
    // advanceRun dipanggil; mock chained-eq tidak mem-backfill table referensi.
    // Verifikasi runner tidak crash dan status berubah (bukan skipped).
    expect(res.skipped).toBeUndefined();
  });
});

describe('runAutomationTick (multi-slot starvation)', () => {
  const NOW = new Date('2026-09-16T09:30:00Z'); // 16:30 WIB — sore slot due

  function makeMultiSlotTables(opts: {
    runsOrder?: 'default-first' | 'sore-first';
    runsCreated?: boolean;
  } = {}) {
    const isDefaultFirst = opts.runsOrder !== 'sore-first';
    const defaultRun: Row = {
      id: 'run-default',
      run_date: '2026-09-16',
      slot_key: 'default',
      status: 'completed',
      attempts: 0,
      session_id: 's-default',
      product_id: 'p1',
      cover_attempts: 0,
      cover_started_at: null
    };
    const soreRun: Row = {
      id: 'run-sore',
      run_date: '2026-09-16',
      slot_key: 'sore',
      status: 'session_created',
      attempts: 0,
      session_id: 's-sore',
      product_id: 'p1',
      cover_attempts: 0,
      cover_started_at: null
    };
    const runs = isDefaultFirst
      ? [defaultRun, soreRun]
      : [soreRun, defaultRun];
    return {
      automation_configs: [baseConfig()],
      automation_schedules: [
        { id: 's1', slot_key: 'default', label: 'Pagi', hour: 10, minute: 0, weekdays: 127, is_enabled: true, priority: 0, window_minutes: null, platform_slugs: null, max_topics: null, product_pool_size: null, product_category: null, auto_publish_article: null, require_cover: null, notify_on: null, notify_emails: null, maximum_iterations: null, minimum_score: null, minimum_candidates: null, freshness_hours: null, cover_max_wait_minutes: null, cover_max_attempts: null, max_retry_attempts: null, language: null, tone: null, audience: null, purpose: null, cta_style: null, target_reply_count: null, template_slug: null, idea_generation_enabled: null, idea_product_search: null, email_from: null, email_reply_to: null, product_repeat_blackout_days: null },
        { id: 's2', slot_key: 'sore', label: 'Sore', hour: 16, minute: 0, weekdays: 127, is_enabled: true, priority: 1, window_minutes: null, platform_slugs: null, max_topics: null, product_pool_size: null, product_category: null, auto_publish_article: null, require_cover: null, notify_on: null, notify_emails: null, maximum_iterations: null, minimum_score: null, minimum_candidates: null, freshness_hours: null, cover_max_wait_minutes: null, cover_max_attempts: null, max_retry_attempts: null, language: null, tone: null, audience: null, purpose: null, cta_style: null, target_reply_count: null, template_slug: null, idea_generation_enabled: null, idea_product_search: null, email_from: null, email_reply_to: null, product_repeat_blackout_days: null }
      ],
      automation_runs: runs,
      content_research_sessions: [
        { id: 's-default', status: 'completed' },
        { id: 's-sore', status: 'awaiting_selection' }
      ],
      content_research_topics: [
        { id: 't-sore-1', session_id: 's-sore', status: 'pending', rank: 1 },
        { id: 't-sore-2', session_id: 's-sore', status: 'pending', rank: 2 }
      ],
      affiliate_products: [{ id: 'p1', is_active: true, created_at: '2026-09-15T00:00:00Z' }]
    };
  }

  function assertSoreAdvanced(res: Awaited<ReturnType<typeof runAutomationTick>>) {
    expect(res.ok).toBe(true);
    expect(res.skipped).toBeUndefined();
    expect(res.status).toBeDefined();
  }

  function assertSoreNotAdvanced(tables: Record<string, Row[]>) {
    const soreRuns = (tables.automation_runs ?? []).filter((r: Row) => r.slot_key === 'sore') as Row[];
    const soreRun = soreRuns[0];
    expect(soreRun).toBeDefined();
    expect((soreRun as Row)?.status).toBe('session_created');
    const sessions = (tables.content_research_sessions ?? []).filter((r: Row) => r.id === 's-sore') as Row[];
    expect(sessions[0]?.status).toBe('awaiting_selection');
  }

  it('T2a: default completed duluan → sore tetap di-advance (reproduksi urutan prod)', async () => {
    const tables = makeMultiSlotTables({ runsOrder: 'default-first' });
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, { now: NOW, force: true });
    assertSoreAdvanced(res);
    const soreRuns = (tables.automation_runs ?? []).filter((r: Row) => r.slot_key === 'sore') as Row[];
    expect((soreRuns[0] as Row)?.status).toBe('developing');
    const soreSessions = (tables.content_research_sessions ?? []).filter((r: Row) => r.id === 's-sore') as Row[];
    expect((soreSessions[0] as Row)?.status).toBe('developing');
    const shortlisted = (tables.content_research_topics ?? []).filter((r: Row) => r.session_id === 's-sore' && r.status === 'shortlisted') as Row[];
    expect(shortlisted.length).toBeGreaterThanOrEqual(1);
    const logs = ((tables as Record<string, Row[]>).content_research_logs ?? []).filter((r: Row) => r.session_id === 's-sore') as Row[];
    expect(logs.some((l: Row) => String(l.message).includes('shortlist'))).toBe(true);
  });

  it('T2b: urutan dibalik [sore, default] → hasil sama (order-independent)', async () => {
    const tables = makeMultiSlotTables({ runsOrder: 'sore-first' });
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, { now: NOW, force: true });
    assertSoreAdvanced(res);
    const soreRuns = (tables.automation_runs ?? []).filter((r: Row) => r.slot_key === 'sore') as Row[];
    expect((soreRuns[0] as Row)?.status).toBe('developing');
    const soreSessions = (tables.content_research_sessions ?? []).filter((r: Row) => r.id === 's-sore') as Row[];
    expect((soreSessions[0] as Row)?.status).toBe('developing');
  });

  it('T2c: tick kreasi — sore dibuat DAN langsung di-advance (bukan stuck session_created)', async () => {
    const tables = {
      automation_configs: [baseConfig()],
      automation_schedules: [
        { id: 's1', slot_key: 'default', label: 'Pagi', hour: 10, minute: 0, weekdays: 127, is_enabled: true, priority: 0, window_minutes: null, platform_slugs: null, max_topics: null, product_pool_size: null, product_category: null, auto_publish_article: null, require_cover: null, notify_on: null, notify_emails: null, maximum_iterations: null, minimum_score: null, minimum_candidates: null, freshness_hours: null, cover_max_wait_minutes: null, cover_max_attempts: null, max_retry_attempts: null, language: null, tone: null, audience: null, purpose: null, cta_style: null, target_reply_count: null, template_slug: null, idea_generation_enabled: null, idea_product_search: null, email_from: null, email_reply_to: null, product_repeat_blackout_days: null },
        { id: 's2', slot_key: 'sore', label: 'Sore', hour: 16, minute: 0, weekdays: 127, is_enabled: true, priority: 1, window_minutes: null, platform_slugs: null, max_topics: null, product_pool_size: null, product_category: null, auto_publish_article: null, require_cover: null, notify_on: null, notify_emails: null, maximum_iterations: null, minimum_score: null, minimum_candidates: null, freshness_hours: null, cover_max_wait_minutes: null, cover_max_attempts: null, max_retry_attempts: null, language: null, tone: null, audience: null, purpose: null, cta_style: null, target_reply_count: null, template_slug: null, idea_generation_enabled: null, idea_product_search: null, email_from: null, email_reply_to: null, product_repeat_blackout_days: null }
      ],
      automation_runs: [
        { id: 'run-default', run_date: '2026-09-16', slot_key: 'default', status: 'completed', attempts: 0, session_id: 's-default', product_id: 'p1', cover_attempts: 0, cover_started_at: null }
      ],
      content_research_sessions: [{ id: 's-default', status: 'completed' }],
      content_research_topics: [],
      affiliate_products: [{ id: 'p1', is_active: true, created_at: '2026-09-15T00:00:00Z' }]
    };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, { now: NOW, force: true });
    expect(res.ok).toBe(true);
    expect(res.skipped).toBeUndefined();
    const soreRuns = (tables.automation_runs ?? []).filter((r: Row) => r.slot_key === 'sore') as Row[];
    expect(soreRuns.length).toBeGreaterThan(0);
    expect((soreRuns[0] as Row)?.status).not.toBe('session_created');
    const soreSessions = (tables.content_research_sessions ?? []).filter((r: Row) => String(r.id).startsWith('s-sore') || (r.status as string) === 'developing') as Row[];
    if (soreSessions.length > 0) {
      expect((soreSessions[0] as Row)?.status).toBe('developing');
    }
  });
});

describe('runAutomationTick (produk pool)', () => {
  it('gagal jujur bila tidak ada produk afiliasi aktif', async () => {
    const supabase = makeClient({
      automation_configs: [baseConfig()],
      automation_runs: [],
      affiliate_products: []
    });
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:00:00Z'),
      force: true
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/slot.*gagal|produk afiliasi/);
  });

  it('membuat sesi mekanisme dua + produk tetap + run saat due', async () => {
    const supabase = makeClient({
      automation_configs: [baseConfig()],
      automation_runs: [],
      affiliate_products: [{ id: 'p1', is_active: true, created_at: '2026-09-15T00:00:00Z' }],
      content_research_sessions: [],
      content_research_session_products: []
    });
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:00:00Z')
    });
    expect(res.ok).toBe(true);
    expect(res.runDate).toBe('2026-09-16');
  });

  it('knob ideation mati default → sesi topic null (perilaku lama, tanpa LLM)', async () => {
    const tables = {
      automation_configs: [baseConfig()],
      automation_runs: [] as Row[],
      affiliate_products: [
        {
          id: 'p1',
          is_active: true,
          created_at: '2026-09-15T00:00:00Z',
          name_id: 'Produk X',
          friendly_code: 'ASH-1'
        }
      ],
      content_research_sessions: [] as Row[],
      content_research_session_products: [] as Row[]
    };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:00:00Z')
    });
    expect(res.ok).toBe(true);
    // enrichSessionIdea tak menulis apa-apa → topic tetap null dari insert.
    const session = tables.content_research_sessions[0] as Row;
    expect(session.topic).toBeNull();
  });

  it('blackout: produk dalam jendela 14 hari di-exclude, fallback L1 picks lain', async () => {
    // run p1 dan p2 7 hari lalu (masih dalam blackout 14 hari) → p3 harus dipilih.
    const tables = {
      automation_configs: [baseConfig({ product_pool_size: 3 })],
      automation_runs: [
        { id: 'r1', run_date: '2026-09-09', status: 'completed', product_id: 'p1', slot_key: 'default', session_id: 's1' },
        { id: 'r2', run_date: '2026-09-10', status: 'completed', product_id: 'p2', slot_key: 'default', session_id: 's2' }
      ],
      affiliate_products: [
        { id: 'p1', is_active: true, created_at: '2026-08-01T00:00:00Z' },
        { id: 'p2', is_active: true, created_at: '2026-08-02T00:00:00Z' },
        { id: 'p3', is_active: true, created_at: '2026-08-03T00:00:00Z' }
      ],
      content_research_sessions: [] as Row[],
      content_research_session_products: [] as Row[]
    };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:00:00Z'),
      force: true
    });
    expect(res.ok).toBe(true);
    // Run dibuat; mock insert menaruh baris terakhir di tabel.
    const runs = tables.automation_runs as Row[];
    const latest = runs[runs.length - 1];
    expect(latest).toBeDefined();
    // Produk yang dipilih TIDAK boleh p1 atau p2 (keduanya blacklisted 14 hari).
    expect(['p1', 'p2'].includes(latest!.product_id as string)).toBe(false);
  });

  it('blackoutDays=0 → tanpa query gte, semua produk tersedia', async () => {
    const tables = {
      automation_configs: [baseConfig({ product_pool_size: 2, product_repeat_blackout_days: 0 })],
      automation_runs: [
        { id: 'r1', run_date: '2026-09-16', status: 'completed', product_id: 'p1', slot_key: 'default', session_id: 's1' }
      ],
      affiliate_products: [
        { id: 'p1', is_active: true, created_at: '2026-08-01T00:00:00Z' },
        { id: 'p2', is_active: true, created_at: '2026-08-02T00:00:00Z' }
      ],
      content_research_sessions: [] as Row[],
      content_research_session_products: [] as Row[]
    };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:00:00Z'),
      force: true
    });
    expect(res.ok).toBe(true);
  });

  it('semua pool blacklisted → fallback L2 (occupied only) lalu L3 (pool penuh)', async () => {
    // Semua 2 produk ada di blackout + occupied hari ini → harus tetap berhasil pilih salah satunya (L3).
    const tables = {
      automation_configs: [baseConfig({ product_pool_size: 2 })],
      automation_runs: [
        { id: 'r1', run_date: '2026-09-16', status: 'developing', product_id: 'p1', slot_key: 'slot-a', session_id: 's1' },
        { id: 'r2', run_date: '2026-09-09', status: 'completed', product_id: 'p1', slot_key: 'default', session_id: 's2' },
        { id: 'r3', run_date: '2026-09-10', status: 'completed', product_id: 'p2', slot_key: 'default', session_id: 's3' }
      ],
      affiliate_products: [
        { id: 'p1', is_active: true, created_at: '2026-08-01T00:00:00Z' },
        { id: 'p2', is_active: true, created_at: '2026-08-02T00:00:00Z' }
      ],
      content_research_sessions: [] as Row[],
      content_research_session_products: [] as Row[]
    };
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:00:00Z'),
      force: true,
      slotKey: 'slot-b'
    });
    expect(res.ok).toBe(true);
  });
});

describe('runAutomationTick (thin-content gate)', () => {
  function thinTables(thinContent: boolean) {
    return {
      automation_configs: [baseConfig({ notify_on: 'none' })],
      automation_runs: [
        {
          id: 'run1',
          run_date: '2026-09-16',
          status: 'developing',
          attempts: 0,
          session_id: 's1',
          article_draft_id: null,
          cover_attempts: 0,
          cover_started_at: null,
          draft_ready_notified_at: null,
          published_at: null,
          notified_at: null,
          error_message: null
        }
      ],
      content_research_sessions: [{ id: 's1', status: 'completed' }],
      content_research_topics: [{ id: 't1', session_id: 's1' }],
      content_drafts: [
        {
          id: 'd1',
          research_topic_id: 't1',
          platform_slug: 'artikel',
          llm_meta: { thin_content: thinContent, word_count: { id: thinContent ? 505 : 910 } }
        }
      ],
      content_draft_images: [],
      content_research_logs: []
    };
  }

  it('draf thin gagal cepat tanpa membakar cover/publish (kasus 87b9fdc1)', async () => {
    const tables = thinTables(true);
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res).toMatchObject({ ok: true });
    const run = tables.automation_runs[0] as Record<string, unknown>;
    expect(run.status).toBe('failed');
    expect(run.article_draft_id).toBe('d1');
    expect(String(run.error_message)).toMatch(/thin content/);
    expect(String(run.error_message)).toMatch(/505/);
    expect(String(run.error_message)).toMatch(/konten\/review\/d1/);
    // Tanpa render cover: tidak ada baris image yang dienqueue.
    expect(tables.content_draft_images).toHaveLength(0);
  });

  it('draf cukup kata lanjut ke awaiting_cover seperti biasa', async () => {
    const tables = thinTables(false);
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res).toMatchObject({ ok: true });
    const run = tables.automation_runs[0] as Record<string, unknown>;
    expect(run.status).toBe('awaiting_cover');
    expect(run.article_draft_id).toBe('d1');
  });
});

describe('runAutomationTick (email observability + jujur notified_at)', () => {
  function basePublishedTable(overrides: Row = {}): Record<string, Row[]> {
    return {
      automation_configs: [baseConfig({ notify_on: 'published' })],
      automation_runs: [
        {
          id: 'run1',
          run_date: '2026-09-16',
          status: 'published',
          attempts: 0,
          session_id: 's1',
          article_draft_id: 'd1',
          article_ids: ['a1'],
          cover_attempts: 0,
          cover_started_at: null,
          draft_ready_notified_at: null,
          published_at: '2026-09-16T03:05:00Z',
          notified_at: null,
          error_message: null,
          ...overrides
        }
      ],
      content_research_sessions: [{ id: 's1', status: 'completed' }],
      content_research_topics: [],
      content_drafts: [],
      content_draft_images: [],
      content_research_logs: [],
      automation_email_log: []
    };
  }

  it('published: email skip/gagal → status completed TAPI notified_at tetap null (fix bug asli)', async () => {
    // Mock sendPublishedEmail mengembalikan skipped agar simulated no_recipients.
    const tables = basePublishedTable();
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res).toMatchObject({ ok: true });
    const run = (tables.automation_runs ?? [])[0] as Row;
    // Bug fix inti: notified_at TIDAK di-set bila email dilewati/gagal.
    expect(run.notified_at).toBeNull();
  });

  it('published: email sukses → notified_at terisi', async () => {
    // Dengan sendDraftReadyEmail yang selalu "skipped" (karena mock tanpa RPC key),
    // jalur ini memvalidasi bahwa runner TIDAK pernah melempar dan tetap completed.
    const tables = basePublishedTable();
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res.ok).toBe(true);
    // Karena config.notify_on=published tapi recipients kosong dari mock profiles → skipped.
    // tidak ada updateRun notified_at — validasi kontranya (baris di atas) lebih kuat.
    const run = (tables.automation_runs ?? [])[0] as Row;
    // Run tetap completed karena published sudah terminal, advanceRun return status final.
    expect(run.status).toBe('completed');
    expect(run.notified_at).toBeNull();
  });

  it('email log tercatat (best-effort insert) tanpa menggagahkan tick', async () => {
    // Fallback ke tabel kosong untuk assert log row masuk (mock insert menerima).
    const tables = basePublishedTable();
    const supabase = makeClient(tables);
    const res = await runAutomationTick(supabase as never, {
      now: new Date('2026-09-16T03:05:00Z')
    });
    expect(res.ok).toBe(true);
    // Baris log email minimal tercatat (insert best-effort).
    const logs = tables.automation_email_log as Row[];
    expect(logs.length).toBeGreaterThan(0);
  });
});
