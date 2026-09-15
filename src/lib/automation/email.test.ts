import { describe, expect, it, vi } from 'vitest';
import { sendViaResend, type AutomationEmailInput } from './email';

const input: AutomationEmailInput = {
  to: ['admin@asharu.id'],
  subject: 'Test',
  html: '<p>Halo</p>',
  from: 'Asharu <notifikasi@asharu.id>',
  replyTo: 'balas@asharu.id'
};

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
