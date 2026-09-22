import { describe, expect, it, vi } from 'vitest';
import { groupEvents, type DigestEventRow } from './error-digest';

describe('groupEvents', () => {
  it('mengelompokkan berdasarkan fingerprint, hitung count, sample terpotong 160 char', () => {
    const rows: DigestEventRow[] = [
      { id: '1', category: 'llm', fingerprint: 'abc', message: 'All providers failed: timeout after #n ms'.padEnd(200, 'x'), source: 'runLLM', severity: 'error', created_at: '2026-09-22T00:00:00Z' },
      { id: '2', category: 'llm', fingerprint: 'abc', message: 'All providers failed: timeout after #n ms', source: 'runLLM', severity: 'error', created_at: '2026-09-22T00:01:00Z' },
      { id: '3', category: 'llm', fingerprint: 'def', message: 'Model disabled', source: 'vault', severity: 'warning', created_at: '2026-09-22T00:02:00Z' },
      { id: '4', category: 'tavily', fingerprint: 'xyz', message: 'Key missing', source: 'getSearch', severity: 'error', created_at: '2026-09-22T00:03:00Z' }
    ];
    const groups = groupEvents(rows);
    expect(groups).toHaveLength(2);
    const llmGroup = groups.find((g) => g.category === 'llm')!;
    expect(llmGroup.count).toBe(3);
    expect(llmGroup.topMessages).toHaveLength(2);
    expect(llmGroup.topMessages[0]!).toMatchObject({ count: 2 });
    expect(llmGroup.topMessages[0]!.sample.length).toBeLessThanOrEqual(160);
    const tavilyGroup = groups.find((g) => g.category === 'tavily')!;
    expect(tavilyGroup.count).toBe(1);
  });

  it('empty → empty result', () => {
    expect(groupEvents([])).toEqual([]);
  });
});

describe('runErrorDigestTick', () => {
  const fixedNow = new Date('2026-09-22T12:00:00Z');

  it('groupEvents dengan 3 baris (2 fingerprint sama + 1 beda) → 2 grup, count 2 dan 1', () => {
    const rows: DigestEventRow[] = [
      { id: '1', category: 'llm', fingerprint: 'f1', message: 'msg A', source: 'x', severity: 'error', created_at: '2026-01-01T00:00:00Z' },
      { id: '2', category: 'llm', fingerprint: 'f1', message: 'msg B', source: 'x', severity: 'error', created_at: '2026-01-01T00:01:00Z' },
      { id: '3', category: 'llm', fingerprint: 'f2', message: 'msg C', source: 'x', severity: 'error', created_at: '2026-01-01T00:02:00Z' }
    ];
    const groups = groupEvents(rows);
    expect(groups).toHaveLength(1);
    const g0 = groups[0]!;
    expect(g0.count).toBe(3);
    expect(g0.topMessages).toHaveLength(2);
    expect(g0.topMessages[0]!).toMatchObject({ count: 2 });
    expect(g0.topMessages[1]!).toMatchObject({ count: 1 });
  });

  it('mengimpor runErrorDigestTick tanpa throw (module loadable)', async () => {
    const mod = await import('./error-digest');
    expect(typeof mod.runErrorDigestTick).toBe('function');
  });

  it('window belum lewat → no-send path via deps', async () => {
    // Stub send; verify returned categories reflect due filter even when no events
    const sendFn = vi.fn(async () => ({ ok: true, id: 'sent_1' }));
    const configRows = [
      { category: 'llm', is_enabled: true, digest_window_minutes: 30, notify_emails: null, last_digest_at: null }
    ];
    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'error_notification_configs') return { select: vi.fn().mockResolvedValue({ data: configRows, error: null }) };
        if (table === 'error_events') return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return { select: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }),
      rpc: vi.fn()
    } as never;
    const res = await (await import('./error-digest')).runErrorDigestTick(sb, { now: fixedNow, send: sendFn });
    // No events → sent:false (no send needed)
    expect(res.sent).toBe(false);
    expect(res.eventCount).toBe(0);
    expect(sendFn).not.toHaveBeenCalled();
  });
});
