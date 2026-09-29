import { describe, expect, it } from 'vitest';
import {
  buildStudioExpiry,
  checkStudioQuota,
  quotaExceededMessage,
  studioInputSchema,
  validateProviderModelLink,
  validateReferenceModelLink,
  parseBatchPrompts,
  validateBatchPrompts,
  checkStudioQuotaForBatch,
  countBatchLines
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

  it('advanced opsional: null lolos; di luar rentang ditolak', () => {
    const base = { prompt: 'a tidy bedroom with soft light', aspectSlug: '1:1' };
    expect(studioInputSchema(500).safeParse(base).success).toBe(true);
    const ok = studioInputSchema(500).safeParse({
      ...base,
      guidance: 4.5,
      steps: 20,
      seed: 42,
      reqWidth: 1120,
      reqHeight: 1120
    });
    expect(ok.success).toBe(true);
    expect(studioInputSchema(500).safeParse({ ...base, guidance: 11 }).success).toBe(false);
    expect(studioInputSchema(500).safeParse({ ...base, steps: 0 }).success).toBe(false);
    expect(studioInputSchema(500).safeParse({ ...base, steps: 51 }).success).toBe(false);
    expect(studioInputSchema(500).safeParse({ ...base, steps: 2.5 }).success).toBe(false);
    expect(studioInputSchema(500).safeParse({ ...base, seed: -1 }).success).toBe(false);
    expect(studioInputSchema(500).safeParse({ ...base, reqWidth: 255 }).success).toBe(false);
    expect(studioInputSchema(500).safeParse({ ...base, reqHeight: 2501 }).success).toBe(false);
  });

  it('pin model support + referensi lolos; tanpa referensi selalu lolos', () => {
    expect(validateReferenceModelLink('https://cdn.test/ref.jpg', 'm-img2img', models)).toBeNull();
    expect(validateReferenceModelLink(null, 'm-flux', models)).toBeNull();
    expect(validateReferenceModelLink('https://cdn.test/ref.jpg', null, models)).toBeNull();
  });
});

describe('parseBatchPrompts — double-newline split', () => {
  it('split \n\n: dua blok jadi dua item', () => {
    const r = parseBatchPrompts('a lively cat portrait...\n\nsecond vivid street scene');
    expect(r).toEqual(['a lively cat portrait...', 'second vivid street scene']);
  });

  it('blok spasian saja dibuang', () => {
    const r = parseBatchPrompts('a lively cat portrait...\n\n   \n\nsecond vivid street scene');
    expect(r).toEqual(['a lively cat portrait...', 'second vivid street scene']);
  });

  it('Windows \\r\\n\\r\\n tetap jadi dua item', () => {
    const r = parseBatchPrompts('first\r\n\r\nsecond\r\n\r\nthird');
    expect(r).toEqual(['first', 'second', 'third']);
  });

  it('blok kosong total = hasil kosong', () => {
    const r = parseBatchPrompts('\n\n\n   \n');
    expect(r).toHaveLength(0);
  });
});

describe('validateBatchPrompts — cap per blok + cap batch', () => {
  it('item <10 char → rejected dengan index & reason', () => {
    const r = validateBatchPrompts(['pendek', 'satu kalimat yang cukup panjang di sini'], 500, 50);
    expect(r.batchRejected).toBeNull();
    expect(r.valid).toHaveLength(1);
    expect(r.rejected).toEqual([{ index: 0, reason: 'Prompt minimal 10 karakter.' }]);
  });

  it('item > maxPromptLength → rejected', () => {
    const tooLong = 'x'.repeat(51);
    const r = validateBatchPrompts([tooLong], 50, 50);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0]!.reason).toMatch(/maksimal 50 karakter/);
  });

  it('N > maxBatch → batch ditolak (valid kosong)', () => {
    const items = Array.from({ length: 51 }, (_, i) => `prompt-${i + 1} yang valid sepanjang 15 karakter ok`.slice(0, 15));
    const r = validateBatchPrompts(items, 500, 50);
    expect(r.batchRejected).toMatch(/Maksimal 50 prompt/);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(0);
  });

  it('happy path dua item lolos', () => {
    const r = validateBatchPrompts(['dua kata cukup', 'lima belas karakter cukup'], 500, 50);
    expect(r.valid).toHaveLength(2);
    expect(r.rejected).toEqual([]);
    expect(r.batchRejected).toBeNull();
  });

  it('empty array → batch ditolak kososng', () => {
    const r = validateBatchPrompts([], 500, 50);
    expect(r.batchRejected).toMatch(/Isi dulu minimal/);
    expect(r.valid).toHaveLength(0);
  });
});

describe('checkStudioQuotaForBatch — N-item check', () => {
  it('limit null = unlimited', () => {
    expect(checkStudioQuotaForBatch(999, null, 50)).toEqual({ allowed: true, remaining: null });
  });

  it('used+n <= limit = allowed; sisa dihitung', () => {
    expect(checkStudioQuotaForBatch(19, 20, 1)).toEqual({ allowed: true, remaining: 1 });
  });

  it('used+n > limit = ditolak penuh; sisa tetap laporan', () => {
    const r = checkStudioQuotaForBatch(19, 20, 2);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(1);
  });

  it('used=0, limit 20, n=20 = pas; n=21 = ditolak', () => {
    // remaining selalu = limit - used (slot hari ini), tidak terpengaruh n
    expect(checkStudioQuotaForBatch(0, 20, 20)).toEqual({ allowed: true, remaining: 20 });
    expect(checkStudioQuotaForBatch(0, 20, 21).allowed).toBe(false);
  });
});

describe('countBatchLines — preview "X blok dari Y baris"', () => {
  it('teks kosong = 0 baris', () => {
    expect(countBatchLines('')).toBe(0);
  });

  it('satu baris tanpa newline = 1', () => {
    expect(countBatchLines('satu prompt utuh')).toBe(1);
  });

  it('newline tunggal menambah baris; baris kosong ikut dihitung', () => {
    expect(countBatchLines('a\nb')).toBe(2);
    expect(countBatchLines('a\n\nb')).toBe(3);
  });

  it('toleran CRLF Windows', () => {
    expect(countBatchLines('a\r\nb\r\nc')).toBe(3);
  });
});
