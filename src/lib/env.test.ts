import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const VALID = {
  NEXT_PUBLIC_SITE_URL: 'https://asharu.id/',
  NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-ABCDEF1234',
  NEXT_PUBLIC_WHATSAPP_URL: 'https://wa.me/628123456789',
  NEXT_PUBLIC_CONTACT_EMAIL: 'hello@asharu.id',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcxyz.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon.placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service.placeholder'
};

describe('parseEnv', () => {
  it('parses a complete valid environment', () => {
    const result = parseEnv(VALID);
    expect(result.siteUrl).toBe('https://asharu.id');
    expect(result.gaMeasurementId).toBe('G-ABCDEF1234');
    expect(result.whatsappUrl).toBe('https://wa.me/628123456789');
    expect(result.contactEmail).toBe('hello@asharu.id');
    expect(result.hasSupabase).toBe(true);
    expect(result.supabaseUrl).toBe('https://abcxyz.supabase.co');
  });

  it('falls back to the production URL and disables optional features', () => {
    const result = parseEnv({});
    expect(result.siteUrl).toBe('https://asharu.id');
    expect(result.gaMeasurementId).toBeUndefined();
    expect(result.whatsappUrl).toBeUndefined();
    expect(result.contactEmail).toBeUndefined();
    expect(result.hasSupabase).toBe(false);
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

describe('.env.example placeholder integrity', () => {
  it('placeholders parse cleanly so copying the file never breaks the build', () => {
    const raw = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
    const parsed = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        })
    );

    const result = parseEnv(parsed);

    expect(result.siteUrl).toBe('https://asharu.id');
    expect(result.gaMeasurementId).toMatch(/^G-[A-Z0-9]+$/);
    expect(result.whatsappUrl).toBe('https://wa.me/628000000000');
    expect(result.contactEmail).toContain('@asharu.id');
  });

  it('keeps the documented variable set in sync with env.ts', () => {
    const raw = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
    const keys = raw
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => line.slice(0, line.indexOf('=')));

    expect(keys.sort()).toEqual(
      [
        'NEXT_PUBLIC_SITE_URL',
        'NEXT_PUBLIC_GA_MEASUREMENT_ID',
        'NEXT_PUBLIC_WHATSAPP_URL',
        'NEXT_PUBLIC_CONTACT_EMAIL',
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'CRON_SECRET'
      ].sort()
    );
  });
});
