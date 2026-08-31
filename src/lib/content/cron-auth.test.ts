import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from './cron-auth';

const SECRET = 'test-cron-secret-0123456789';

describe('isCronAuthorized', () => {
  it('allows a matching Bearer token', () => {
    const request = new Request('https://asharu.id/api/content/process', {
      headers: { authorization: `Bearer ${SECRET}` }
    });
    expect(isCronAuthorized(request, { secret: SECRET, isProduction: true })).toBe(true);
  });

  it('rejects a wrong Bearer token', () => {
    const request = new Request('https://asharu.id/api/content/process', {
      headers: { authorization: 'Bearer wrong-secret' }
    });
    expect(isCronAuthorized(request, { secret: SECRET, isProduction: true })).toBe(false);
  });

  it('rejects a request with no auth header', () => {
    const request = new Request('https://asharu.id/api/content/process');
    expect(isCronAuthorized(request, { secret: SECRET, isProduction: true })).toBe(false);
  });

  it('rejects the spoofable x-vercel-cron header (P0 regression)', () => {
    const request = new Request('https://asharu.id/api/content/process', {
      method: 'POST',
      headers: { 'x-vercel-cron': '1' }
    });
    expect(isCronAuthorized(request, { secret: SECRET, isProduction: true })).toBe(false);
  });

  it('fails closed in production when no secret is configured', () => {
    const request = new Request('https://asharu.id/api/content/process', {
      method: 'POST',
      headers: { 'x-vercel-cron': '1' }
    });
    expect(isCronAuthorized(request, { isProduction: true })).toBe(false);
  });

  it('allows secretless calls outside production (local dev)', () => {
    const request = new Request('http://localhost:3000/api/content/process', {
      method: 'POST'
    });
    expect(isCronAuthorized(request, { isProduction: false })).toBe(true);
  });
});
