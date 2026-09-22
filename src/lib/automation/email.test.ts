import { describe, expect, it, vi } from 'vitest';
import {
  classifyResendError,
  sendDraftReadyEmail,
  sendErrorDigestEmail,
  sendFailureEmail,
  sendPublishedEmail,
  sendViaResend,
  type AutomationEmailInput,
  type ErrorDigestGroup
} from './email';
import type { AutomationConfig } from './config';

const input: AutomationEmailInput = {
  to: ['admin@asharu.id'],
  subject: 'Test',
  html: '<p>Halo</p>',
  from: 'Asharu <updates@alamaby.com>',
  replyTo: 'balas@asharu.id'
};

function cfg(over: Partial<AutomationConfig> = {}): AutomationConfig {
  return {
    id: 1,
    isEnabled: true,
    scheduleHour: 10,
    scheduleMinute: 0,
    timezone: 'Asia/Jakarta',
    scheduleWindowMinutes: 180,
    mechanism: 'dua',
    platformSlugs: ['artikel'],
    templateSlug: null,
    maxTopics: 1,
    language: 'both',
    tone: 'casual',
    audience: 'umum',
    purpose: 'x',
    ctaStyle: 'soft_sell',
    targetReplyCount: null,
    productPoolSize: 50,
    productCategory: null,
    ideaGenerationEnabled: false,
    ideaProductSearch: true,
    requireCover: true,
    coverMaxWaitMinutes: 60,
    coverMaxAttempts: 3,
    autoPublishArticle: true,
    maxRetryAttempts: 3,
    notifyOn: 'both',
    notifyEmails: ['admin@asharu.id'],
    emailFrom: 'Asharu <updates@alamaby.com>',
      emailReplyTo: null,
      maxIterations: 1,
      minScore: null,
      minCandidates: null,
      freshnessHours: null,
      productBlackoutDays: 14,
      ...over
  };
}

/** Client yang RPC-nya melempar (simulasi gangguan jaringan Supabase). */
const throwingClient = {
  rpc: () => {
    throw new Error('network down');
  }
} as never;

function mockFetch(status: number, body: string): typeof fetch {
  return vi.fn(async () =>
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
  ) as unknown as typeof fetch;
}

describe('sendViaResend', () => {
  it('mengirim POST ke Resend dengan payload yang benar', async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ id: 'msg_123' }));
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.ok).toBe(true);
    expect(res.id).toBe('msg_123');
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe('https://api.resend.com/emails');
    expect(call?.[1].method).toBe('POST');
    expect(call?.[1].headers.Authorization).toBe('Bearer re_test');
    const payload = JSON.parse(call?.[1].body as string);
    expect(payload).toMatchObject({
      from: input.from,
      to: input.to,
      subject: 'Test',
      reply_to: 'balas@asharu.id'
    });
  });

  it('tanpa penerima → skipped tanpa memanggil fetch', async () => {
    const fetchImpl = mockFetch(200, '{}');
    const res = await sendViaResend('re_test', { ...input, to: [] }, fetchImpl);
    expect(res).toMatchObject({ ok: false, skipped: true, skippedReason: 'no_recipients' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('status 403 → error string mengandung 403 (bukan throw)', async () => {
    const fetchImpl = mockFetch(403, 'domain not verified');
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('403');
    expect(res.error).toContain('domain not verified');
  });

  it('sukses tanpa JSON valid tetap ok (id undefined)', async () => {
    const fetchImpl = mockFetch(200, 'not-json');
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.ok).toBe(true);
    expect(res.id).toBeUndefined();
  });

  it('fetch melempar → error, tidak throw', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('network down');
  });
});

/**
 * Kontrak penting: sender publik TIDAK PERNAH melempar, apa pun yang terjadi
 * (RPC gagal, tidak ada penerima, tidak ada key). Kalau ini pecah, kegagalan
 * email bisa menghentikan workflow automation.
 */
describe('sender publik selalu best-effort', () => {
  const draftInput = {
    recipients: ['admin@asharu.id'],
    runDate: '2026-09-16',
    productName: 'Produk X',
    drafts: [{ platform: 'artikel', draftId: 'd4e5f6a7-0000-0000-0000-000000000000' }],
    siteUrl: 'https://asharu.id'
  };
  const publishedInput = {
    recipients: ['admin@asharu.id'],
    runDate: '2026-09-16',
    productName: 'Produk X',
    articles: [{ locale: 'id', slug: 'tips-x' }],
    siteUrl: 'https://asharu.id'
  };
  const failureInput = {
    recipients: ['admin@asharu.id'],
    runDate: '2026-09-16',
    stage: 'publishing',
    error: 'boom',
    siteUrl: 'https://asharu.id'
  };

  it('RPC melempar → resolve ke skipped, tidak throw (draft_ready)', async () => {
    const res = await sendDraftReadyEmail(throwingClient, cfg(), draftInput);
    expect(res).toMatchObject({ ok: false, skipped: true });
  });

  it('RPC melempar → resolve ke skipped, tidak throw (published)', async () => {
    const res = await sendPublishedEmail(throwingClient, cfg(), publishedInput);
    expect(res).toMatchObject({ ok: false, skipped: true });
  });

  it('RPC melempar → resolve ke skipped, tidak throw (failure)', async () => {
    const res = await sendFailureEmail(throwingClient, cfg(), failureInput);
    expect(res).toMatchObject({ ok: false, skipped: true });
  });

  it('tanpa penerima → skipped tanpa menyentuh Vault', async () => {
    const res = await sendDraftReadyEmail(throwingClient, cfg(), { ...draftInput, recipients: [] });
    expect(res).toMatchObject({ ok: false, skipped: true, error: 'no recipients' });
  });

  it('tidak ada key (RPC error biasa) → skipped', async () => {
    const noKeyClient = {
      rpc: async () => ({ data: null, error: { message: 'not found' } })
    } as never;
    const res = await sendPublishedEmail(noKeyClient, cfg(), publishedInput);
    expect(res).toMatchObject({ ok: false, skipped: true, skippedReason: 'key_missing', error: 'resend key not configured' });
  });

  it('deliver via sendDraftReadyEmail tidak pernah melempar walau fetch reject', async () => {
    const rejectingFetch = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    // sendViaResend menangani reject → resolve dengan error, bukan throw.
    const res = await sendViaResend('re_test', input, rejectingFetch);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('ECONNRESET');
  });
});
describe('classifyResendError', () => {
  it('403 + "not authorized to send emails from" → unauthorized_sender', () => {
    expect(classifyResendError(403, '{"message":"This API key is not authorized to send emails from alamaby.com"}')).toBe('unauthorized_sender');
  });
  it('403 + "domain is not verified" → domain_not_verified', () => {
    expect(classifyResendError(403, '{"message":"Domain is not verified"}')).toBe('domain_not_verified');
  });
  it('403 + generic → resend_error', () => {
    expect(classifyResendError(403, 'something went wrong')).toBe('resend_error');
  });
  it('401 + invalid key → invalid_api_key', () => {
    expect(classifyResendError(401, '{"message":"API key is invalid"}')).toBe('invalid_api_key');
  });
  it('500 → resend_error', () => {
    expect(classifyResendError(500, 'internal error')).toBe('resend_error');
  });
});

describe('sendViaResend code field', () => {
  it('403 unauthorized_sender sets code + error non-breaking', async () => {
    const fetchImpl = mockFetch(403, '{"statusCode":403,"message":"This API key is not authorized to send emails from alamaby.com"}');
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('unauthorized_sender');
    expect(res.error).toContain('403');
  });
  it('403 domain_not_verified sets code', async () => {
    const fetchImpl = mockFetch(403, '{"message":"Domain is not verified"}');
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.code).toBe('domain_not_verified');
  });
  it('sukses tidak punya code', async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ id: 'msg_ok' }));
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.ok).toBe(true);
    expect(res.code).toBeUndefined();
  });
});

describe('sendErrorDigestEmail', () => {
  const digestCfg = cfg();
  const groups: ErrorDigestGroup[] = [
    {
      category: 'tavily',
      count: 2,
      topMessages: [{ fingerprint: 'abc123def456', count: 2, sample: 'Tavily tidak mengembalikan hasil' }]
    },
    {
      category: 'llm',
      count: 1,
      topMessages: [{ fingerprint: 'xyz789ghi012', count: 1, sample: 'All LLM providers failed' }]
    }
  ];
  const input = {
    recipients: ['admin@asharu.id'],
    windowMinutes: 30,
    groups,
    totalEvents: 3,
    siteUrl: 'https://asharu.id'
  };

  it('sukses mengirim email digest dengan payload yang benar', async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ id: 'digest_1' }));
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);
    const mockClient = {
      rpc: async () => ({ data: 're_key', error: null }),
      from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ data: null, error: null }) }))
    } as never;
    const res = await sendErrorDigestEmail(mockClient, digestCfg, { ...input, siteUrl: 'https://asharu.id' });
    expect(res.ok).toBe(true);
    expect(res.id).toBe('digest_1');
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe('https://api.resend.com/emails');
    const payload = JSON.parse(call?.[1].body as string);
    expect(payload.subject).toContain('30 menit');
    expect(payload.subject).toContain('3 kejadian');
    expect(payload.html).toContain('tavily');
    expect(payload.html).toContain('llm');
    spy.mockRestore();
  });

  it('groups kosong → skipped tanpa memanggil fetch', async () => {
    const fetchImpl = mockFetch(200, '{}');
    const mockClient = {
      rpc: async () => ({ data: 're_key', error: null })
    } as never;
    const res = await sendErrorDigestEmail(mockClient, digestCfg, { ...input, groups: [] });
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('key hilang → skipped tanpa memanggil fetch Resend', async () => {
    const noKeyClient = {
      rpc: async () => ({ data: null, error: { message: 'not found' } })
    } as never;
    const res = await sendErrorDigestEmail(noKeyClient, digestCfg, input);
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.skippedReason).toBe('key_missing');
  });
});

