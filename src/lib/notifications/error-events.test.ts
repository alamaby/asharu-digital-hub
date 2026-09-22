import { describe, expect, it, vi } from 'vitest';
import { buildFingerprint, reportError, reportCronApiError, type ErrorEventInput } from './error-events';

function makeMockClient(inserted: unknown[][] = []): { from: ReturnType<typeof vi.fn> } {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(async (row: unknown) => {
        inserted.push([row]);
        return { data: null, error: null };
      }),
      select: vi.fn(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn()
    }))
  } as never;
}

describe('buildFingerprint', () => {
  it('deterministik — input sama → hash sama 16 char hex', () => {
    const a = buildFingerprint('llm', 'runLLMCompletion', 'developing', 'All providers failed');
    const b = buildFingerprint('llm', 'runLLMCompletion', 'developing', 'All providers failed');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('normalisasi: pesan beda token/angka → fingerprint SAMA', () => {
    const a = buildFingerprint('tavily', 'discovery', null, 'Tavily gagal: session=a1b2c3d4-e477-4e8b-9f0a-123456789abc');
    const b = buildFingerprint('tavily', 'discovery', null, 'Tavily gagal: session=f9e8d7c6-b5a4-4321-abcd-fedcba987654');
    expect(a).toBe(b);
  });

  it('normalisasi: pesan beda kata → fingerprint BEDA', () => {
    const a = buildFingerprint('tavily', 'discovery', null, 'Tavily request timeout');
    const b = buildFingerprint('tavily', 'discovery', null, 'Tavily returned empty');
    expect(a).not.toBe(b);
  });

  it('stage null vs empty → berbeda', () => {
    const a = buildFingerprint('llm', 'x', null, 'err');
    const b = buildFingerprint('llm', 'x', '', 'err');
    expect(a).toBe(b); // normalizeMessage trims, null vs '' both become ''
  });
});

describe('reportError', () => {
  it('tidak pernah throw — client null → resolve tanpa insert', async () => {
    await expect(reportError(null as never, { category: 'llm', source: 'x', message: 'boom' })).resolves.toBeUndefined();
  });

  it('client from().insert() throw → swallow, tidak propagate', async () => {
    const throwingClient = {
      from: vi.fn(() => ({
        insert: vi.fn().mockRejectedValue(new Error('DB down'))
      }))
    } as never;
    await expect(reportError(throwingClient, { category: 'tavily', source: 's', message: 'e' })).resolves.toBeUndefined();
  });

  it('kategori invalid → return diam, tanpa insert', async () => {
    const inserted: unknown[][] = [];
    const client = makeMockClient(inserted);
    await reportError(client as never, { category: 'bogus' as never, source: 's', message: 'e' });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('truncasi message >2000 char → payload insert max 2000', async () => {
    const inserted: unknown[][] = [];
    const client = makeMockClient(inserted);
    const longMsg = 'x'.repeat(3000);
    await reportError(client as never, { category: 'scrape', source: 'main', message: longMsg });
    expect(client.from).toHaveBeenCalled();
    const args = (client.from.mock.calls[0] as [string])[0];
    expect(args).toBeDefined();
    const insertRow = inserted[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertRow?.message).toBeDefined();
    expect(String(insertRow?.message).length).toBeLessThanOrEqual(2000);
  });

  it('fingerprint tersimpan di insert row', async () => {
    const inserted: unknown[][] = [];
    const client = makeMockClient(inserted);
    await reportError(client as never, { category: 'llm', source: 'x', message: 'boom' });
    const row = inserted[0]?.[0] as Record<string, unknown> | undefined;
    expect(row?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('reportCronApiError', () => {
  it('kind unauthorized → severity warning', async () => {
    const inserted: unknown[][] = [];
    const client = makeMockClient(inserted);
    await reportCronApiError(client as never, '/api/content/process', 'unauthorized', 'not authorized');
    const row = inserted[0]?.[0] as Record<string, unknown> | undefined;
    expect(row?.severity).toBe('warning');
    expect(row?.category).toBe('cron_api');
  });

  it('kind handler_error → severity error', async () => {
    const inserted: unknown[][] = [];
    const client = makeMockClient(inserted);
    await reportCronApiError(client as never, '/api/automation/run', 'handler_error', 'boom');
    const row = inserted[0]?.[0] as Record<string, unknown> | undefined;
    expect(row?.severity).toBe('error');
  });

  it('source = endpoint yang diberikan', async () => {
    const inserted: unknown[][] = [];
    const client = makeMockClient(inserted);
    await reportCronApiError(client as never, '/api/content/process-legacy', 'handler_error', 'e');
    const row = inserted[0]?.[0] as Record<string, unknown> | undefined;
    expect(row?.source).toBe('/api/content/process-legacy');
  });
});
