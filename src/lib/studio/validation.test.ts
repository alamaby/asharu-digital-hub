import { describe, expect, it } from 'vitest';
import {
  buildStudioExpiry,
  checkStudioQuota,
  quotaExceededMessage,
  studioInputSchema,
  validateProviderModelLink,
  validateReferenceModelLink
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

describe('studio reference validation', () => {
  const models = [
    { id: 'm-img2img', supports_reference: true, display_name: 'SD 1.5 Img2Img' },
    { id: 'm-flux', supports_reference: false, display_name: 'Flux 1 Schnell' }
  ];

  it('strength di luar 0–1 ditolak skema', () => {
    const bad = studioInputSchema(500).safeParse({ prompt: 'a tidy bedroom with soft light', aspectSlug: '1:1', referenceStrength: 2 });
    expect(bad.success).toBe(false);
    const ok = studioInputSchema(500).safeParse({ prompt: 'a tidy bedroom with soft light', aspectSlug: '1:1', referenceStrength: 0.4 });
    expect(ok.success).toBe(true);
  });

  it('pin model non-support + referensi ditolak dengan pesan jelas', () => {
    expect(validateReferenceModelLink('https://cdn.test/ref.jpg', 'm-flux', models)).toMatch(/tidak mendukung image reference/);
  });

  it('pin model support + referensi lolos; tanpa referensi selalu lolos', () => {
    expect(validateReferenceModelLink('https://cdn.test/ref.jpg', 'm-img2img', models)).toBeNull();
    expect(validateReferenceModelLink(null, 'm-flux', models)).toBeNull();
    expect(validateReferenceModelLink('https://cdn.test/ref.jpg', null, models)).toBeNull();
  });
});
