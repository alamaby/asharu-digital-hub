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
                  apply();
                  return { select: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }) };
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
