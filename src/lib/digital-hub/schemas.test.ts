import { describe, expect, it } from 'vitest';
import {
  contentReviewSchema,
  parseJsonWithSchema,
  portfolioTransformSchema
} from './schemas';
import { assertHumanApproval } from './services';

describe('digital-hub schemas', () => {
  it('parses review JSON with severity levels', () => {
    const text = JSON.stringify({
      clarityFindings: ['Perjelas tanggal.'],
      consistencyFindings: [],
      unsupportedClaims: [{ severity: 'critical', message: 'Klaim tanpa bukti.' }],
      missingContext: ['Lokasi umum.'],
      duplicationRisk: 'rendah',
      channelFit: 'Cocok.',
      recommendations: ['Tambahkan bukti.']
    });
    const r = parseJsonWithSchema(contentReviewSchema, text);
    expect(r.ok).toBe(true);
  });

  it('rejects invalid severity', () => {
    const text = JSON.stringify({
      unsupportedClaims: [{ severity: 'extreme', message: 'x' }]
    });
    expect(parseJsonWithSchema(contentReviewSchema, text).ok).toBe(false);
  });

  it('rejects non-JSON output', () => {
    expect(parseJsonWithSchema(contentReviewSchema, 'bukan json').ok).toBe(false);
  });

  it('portfolio transform keeps missingFields instead of inventing', () => {
    const text = JSON.stringify({
      title: 'Contoh',
      summary: 'Ringkasan yang cukup panjang untuk lolos validasi minimal.',
      approach: 'Pendekatan tercatat.',
      evidence: [],
      missingFields: ['customer_identity', 'completion_date']
    });
    const r = parseJsonWithSchema(portfolioTransformSchema, text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.missingFields).toContain('customer_identity');
  });
});

describe('human approval gate', () => {
  it('throws without explicit approval', () => {
    expect(() => assertHumanApproval(null, null)).toThrow();
    expect(() => assertHumanApproval('owner', null)).toThrow();
  });

  it('passes with approval record', () => {
    expect(() => assertHumanApproval('owner', '2026-10-08T00:00:00+07:00')).not.toThrow();
  });
});
