import { describe, expect, it } from 'vitest';
import {
  buildStudioExpiry,
  checkStudioQuota,
  quotaExceededMessage,
  studioInputSchema,
  validateProviderModelLink
} from './validation';

describe('studio validation', () => {
  it('prompt <10 karakter ditolak dengan pesan jelas', () => {
    const r = studioInputSchema(500).safeParse({ prompt: 'kucing', aspectSlug: '1:1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.message).toMatch(/minimal 10 karakter/);
    }
  });

  it('prompt > max config ditolak', () => {
    const r = studioInputSchema(50).safeParse({ prompt: 'a'.repeat(51), aspectSlug: '1:1' });
    expect(r.success).toBe(false);
  });

  it('model milik provider lain ditolak', () => {
    const msg = validateProviderModelLink('prov-a', 'model-x', [
      { id: 'model-x', provider_id: 'prov-b' }
    ]);
    expect(msg).toMatch(/bukan milik provider/);
  });

  it('model cocok provider lolos', () => {
    expect(
      validateProviderModelLink('prov-a', 'model-x', [{ id: 'model-x', provider_id: 'prov-a' }])
    ).toBeNull();
  });

  it('expiry = now + retention_days', () => {
    const now = new Date('2026-09-11T00:00:00.000Z');
    expect(buildStudioExpiry(now, 30)).toBe('2026-10-11T00:00:00.000Z');
  });

  it('kuota: limit null = unlimited', () => {
    expect(checkStudioQuota(999, null)).toEqual({ allowed: true, remaining: null });
  });

  it('kuota habis tepat di limit', () => {
    expect(checkStudioQuota(20, 20).allowed).toBe(false);
    expect(checkStudioQuota(19, 20)).toEqual({ allowed: true, remaining: 1 });
    expect(quotaExceededMessage(20)).toMatch(/Kuota harian habis/);
  });
});
