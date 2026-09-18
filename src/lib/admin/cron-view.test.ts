import { describe, expect, it } from 'vitest';
import { formatDurationMs, cronStatusTone, truncateBody } from './cron-view';

describe('formatDurationMs', () => {
  it('returns dash for null/undefined', () => {
    expect(formatDurationMs(null)).toBe('—');
    expect(formatDurationMs(undefined)).toBe('—');
  });
  it('shows ms below 1 second', () => {
    expect(formatDurationMs(42)).toBe('42 ms');
  });
  it('shows seconds up to 59', () => {
    expect(formatDurationMs(5000)).toBe('5 s');
  });
  it('shows minutes with remainder', () => {
    expect(formatDurationMs(135000)).toBe('2 m 15 d');
  });
  it('shows pure minutes when remainder is 0', () => {
    expect(formatDurationMs(120000)).toBe('2 m');
  });
});

describe('cronStatusTone', () => {
  it('maps succeeded -> success', () => expect(cronStatusTone('succeeded')).toBe('success'));
  it('maps failed -> error', () => expect(cronStatusTone('failed')).toBe('error'));
  it('maps running -> warning', () => expect(cronStatusTone('running')).toBe('warning'));
  it('falls back to neutral for unknown', () => expect(cronStatusTone('unknown')).toBe('neutral'));
});

describe('truncateBody', () => {
  it('returns empty for null/undefined', () => {
    expect(truncateBody(null)).toBe('');
    expect(truncateBody(undefined)).toBe('');
  });
  it('keeps short strings intact', () => {
    expect(truncateBody('hello', 10)).toBe('hello');
  });
  it('truncates long strings with ellipsis', () => {
    const long = 'x'.repeat(500);
    const out = truncateBody(long, 400);
    expect(out.length).toBe(401); // 400 chars + '…'
    expect(out.endsWith('…')).toBe(true);
  });
});
