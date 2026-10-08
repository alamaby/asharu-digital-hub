import { describe, expect, it } from 'vitest';
import { validatePilotInterest } from './validation';

const valid = {
  name: 'Sari',
  businessName: 'Dapur Sari',
  category: 'kuliner',
  channel: 'instagram',
  challenge: 'Sulit membuat konten rutin tiap minggu.',
  contact: 'sari@example.com',
  consent: true,
  website: ''
};

describe('validatePilotInterest', () => {
  it('accepts valid email contact', () => {
    expect(validatePilotInterest(valid).success).toBe(true);
  });

  it('accepts valid WhatsApp contact', () => {
    const r = validatePilotInterest({ ...valid, contact: '+628123456789' });
    expect(r.success).toBe(true);
  });

  it('rejects honeypot', () => {
    const r = validatePilotInterest({ ...valid, website: 'bot' });
    expect(r.success).toBe(false);
  });

  it('requires consent', () => {
    const r = validatePilotInterest({ ...valid, consent: false });
    expect(r.success).toBe(false);
  });

  it('rejects short challenge and invalid contact', () => {
    expect(validatePilotInterest({ ...valid, challenge: 'x' }).success).toBe(false);
    expect(validatePilotInterest({ ...valid, contact: 'xx' }).success).toBe(false);
  });

  it('rejects unknown category/channel', () => {
    expect(validatePilotInterest({ ...valid, category: 'nft' }).success).toBe(false);
    expect(validatePilotInterest({ ...valid, channel: 'radio' }).success).toBe(false);
  });
});
