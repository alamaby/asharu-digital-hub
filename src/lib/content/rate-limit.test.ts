import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) })
}));

import {
  DEFAULT_RATE_LIMIT_WINDOW_MINUTES,
  cleanupExpiredRateLimits,
  consumeRateLimit,
  getClientIp
} from './rate-limit';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('getClientIp', () => {
  it('prefers x-vercel-forwarded-for (platform header, tidak bisa dipalsukan)', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '9.9.9.9',
      'x-real-ip': '8.8.8.8',
      'x-forwarded-for': '1.2.3.4'
    });
    expect(getClientIp(headers)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' });
    expect(getClientIp(headers)).toBe('9.9.9.9');
  });

  it('uses the first x-forwarded-for entry when platform headers are absent', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('returns unknown when no header', () => {
    expect(getClientIp(new Headers())).toBe('unknown');
  });

  it('trims whitespace', () => {
    const headers = new Headers({ 'x-forwarded-for': '  1.1.1.1  ' });
    expect(getClientIp(headers)).toBe('1.1.1.1');
  });
});

describe('consumeRateLimit', () => {
  it('meneruskan limit + window ke RPC dan mengembalikan allowed/count', async () => {
    mockRpc.mockResolvedValue({ data: [{ allowed: false, count: 6 }], error: null });
    const result = await consumeRateLimit('1.2.3.4', 'endpoint_try', 30, 120);

    expect(mockRpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_ip: '1.2.3.4',
      p_scope: 'endpoint_try',
      p_limit: 30,
      p_window_minutes: 120
    });
    expect(result).toEqual({ allowed: false, count: 6 });
  });

  it('default scope content_request, limit 5, window 60 menit', async () => {
    mockRpc.mockResolvedValue({ data: [{ allowed: true, count: 1 }], error: null });
    await consumeRateLimit('1.2.3.4');

    expect(mockRpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_ip: '1.2.3.4',
      p_scope: 'content_request',
      p_limit: 5,
      p_window_minutes: DEFAULT_RATE_LIMIT_WINDOW_MINUTES
    });
  });

  it('menerima bentuk objek tunggal (bukan array) dari PostgREST', async () => {
    mockRpc.mockResolvedValue({ data: { allowed: true, count: 3 }, error: null });
    await expect(consumeRateLimit('1.2.3.4', 'chat_lab', 30)).resolves.toEqual({
      allowed: true,
      count: 3
    });
  });

  it('fail-open + catat error bila RPC gagal (DB hiccup / migrasi belum di-apply)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });

    await expect(consumeRateLimit('1.2.3.4')).resolves.toEqual({ allowed: true, count: 0 });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('function not found'));
    errorSpy.mockRestore();
  });

  it('tanpa baris hasil → allowed (fail-open)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(consumeRateLimit('1.2.3.4')).resolves.toEqual({ allowed: true, count: 0 });
  });
});

describe('cleanupExpiredRateLimits', () => {
  it('mengembalikan jumlah baris terhapus', async () => {
    mockRpc.mockResolvedValue({ data: 42, error: null });
    await expect(cleanupExpiredRateLimits()).resolves.toEqual({ deleted: 42 });
    expect(mockRpc).toHaveBeenCalledWith('cleanup_expired_rate_limits', {
      p_older_than_minutes: 1440
    });
  });

  it('melempar error supaya cron cleanup tidak diam-diam sukses', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(cleanupExpiredRateLimits()).rejects.toThrow(/cleanup_expired_rate_limits: boom/);
  });
});
