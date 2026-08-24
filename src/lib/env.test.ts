import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const VALID = {
  NEXT_PUBLIC_SITE_URL: 'https://asharu.id/',
  NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-ABCDEF1234',
  NEXT_PUBLIC_WHATSAPP_URL: 'https://wa.me/628123456789',
  NEXT_PUBLIC_CONTACT_EMAIL: 'hello@asharu.id'
};

describe('parseEnv', () => {
  it('parses a complete valid environment', () => {
    const result = parseEnv(VALID);
    expect(result.siteUrl).toBe('https://asharu.id');
    expect(result.gaMeasurementId).toBe('G-ABCDEF1234');
    expect(result.whatsappUrl).toBe('https://wa.me/628123456789');
    expect(result.contactEmail).toBe('hello@asharu.id');
  });

  it('falls back to the production URL and disables optional features', () => {
    const result = parseEnv({});
    expect(result.siteUrl).toBe('https://asharu.id');
    expect(result.gaMeasurementId).toBeUndefined();
    expect(result.whatsappUrl).toBeUndefined();
    expect(result.contactEmail).toBeUndefined();
  });

  it('treats whitespace-only values as unset', () => {
    const result = parseEnv({
      ...VALID,
      NEXT_PUBLIC_GA_MEASUREMENT_ID: '   '
    });
    expect(result.gaMeasurementId).toBeUndefined();
  });

  it('rejects a malformed GA measurement ID', () => {
    expect(() =>
      parseEnv({ ...VALID, NEXT_PUBLIC_GA_MEASUREMENT_ID: 'UA-1234' })
    ).toThrow(/GA4 Measurement ID/);
  });

  it('rejects a non-wa.me WhatsApp URL', () => {
    expect(() =>
      parseEnv({ ...VALID, NEXT_PUBLIC_WHATSAPP_URL: 'https://t.me/asharu' })
    ).toThrow(/WhatsApp URL/);
  });

  it('rejects an invalid contact email', () => {
    expect(() =>
      parseEnv({ ...VALID, NEXT_PUBLIC_CONTACT_EMAIL: 'not-an-email' })
    ).toThrow(/email/i);
  });

  it('rejects an http (non-https) site URL', () => {
    expect(() =>
      parseEnv({ ...VALID, NEXT_PUBLIC_SITE_URL: 'http://asharu.id' })
    ).toThrow(/https/);
  });
});
