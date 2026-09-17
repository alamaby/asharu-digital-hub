import { describe, expect, it, vi } from 'vitest';
import {
  sendDraftReadyEmail,
  sendFailureEmail,
  sendPublishedEmail,
  sendViaResend,
  type AutomationEmailInput
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
    expect(res).toMatchObject({ ok: false, skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('status non-2xx → error berisi status + body (terpotong)', async () => {
    const fetchImpl = mockFetch(422, 'domain not verified');
    const res = await sendViaResend('re_test', input, fetchImpl);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('422');
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
    expect(res).toMatchObject({ ok: false, skipped: true, error: 'resend key not configured' });
  });
});
