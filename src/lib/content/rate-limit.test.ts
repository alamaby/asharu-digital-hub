import { describe, expect, it } from 'vitest';
import { getClientIp } from './rate-limit';

describe('getClientIp', () => {
  it('prefers x-forwarded-for first entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '9.9.9.9' });
    expect(getClientIp(headers)).toBe('9.9.9.9');
  });

  it('returns unknown when no header', () => {
    expect(getClientIp(new Headers())).toBe('unknown');
  });

  it('trims whitespace', () => {
    const headers = new Headers({ 'x-forwarded-for': '  1.1.1.1  ' });
    expect(getClientIp(headers)).toBe('1.1.1.1');
  });
});
