import { describe, expect, it } from 'vitest';
import {
  parseRunStatusFilter,
  pickPrimaryTopic,
  formatRunDuration,
  type RunTopicRow
} from './automation-runs-query';

describe('parseRunStatusFilter', () => {
  it('active → active', () => { expect(parseRunStatusFilter('active')).toBe('active'); });
  it('completed → completed', () => { expect(parseRunStatusFilter('completed')).toBe('completed'); });
  it('failed → failed', () => { expect(parseRunStatusFilter('failed')).toBe('failed'); });
  it('all → all', () => { expect(parseRunStatusFilter('all')).toBe('all'); });
  it('null/undefined → all', () => {
    expect(parseRunStatusFilter(null)).toBe('all');
    expect(parseRunStatusFilter(undefined)).toBe('all');
  });
  it('nilai tak dikenal → all', () => {
    expect(parseRunStatusFilter('x')).toBe('all');
    expect(parseRunStatusFilter(123)).toBe('all');
  });
});

describe('pickPrimaryTopic', () => {
  const row = (overrides: Partial<RunTopicRow> = {}): RunTopicRow => ({
    session_id: 's1', topic: 'default', rank: 9, status: null, ...overrides
  });

  it('kosong → null', () => {
    expect(pickPrimaryTopic([], 's1')).toBeNull();
    expect(pickPrimaryTopic([], 'other')).toBeNull();
  });

  it('pilih shortlisted rank terkecil bila ada', () => {
    const rows: RunTopicRow[] = [
      row({ session_id: 's1', topic: 'T1', rank: 2, status: 'shortlisted' }),
      row({ session_id: 's1', topic: 'T2', rank: 1, status: 'shortlisted' }),
      row({ session_id: 's1', topic: 'T3', rank: 3, status: null })
    ];
    expect(pickPrimaryTopic(rows, 's1')).toBe('T2');
  });

  it('tanpa shortlisted → rank terkecil', () => {
    const rows: RunTopicRow[] = [
      row({ session_id: 's1', topic: 'A', rank: 5, status: null }),
      row({ session_id: 's1', topic: 'B', rank: 2, status: null }),
      row({ session_id: 's1', topic: 'C', rank: null, status: null })
    ];
    // rank null diperlakukan 999; jadi B (rank 2) menang.
    expect(pickPrimaryTopic(rows, 's1')).toBe('B');
  });

  it('sessionId tak cocok → null', () => {
    expect(pickPrimaryTopic([row({ session_id: 's2' })], 's1')).toBeNull();
  });
});

describe('formatRunDuration', () => {
  const base = '2026-09-22T10:00:00Z';

  it('45 mnt → "45 mnt"', () => {
    const start = new Date(base).toISOString();
    const end = new Date(new Date(start).getTime() + 45 * 60 * 1000).toISOString();
    expect(formatRunDuration(start, end)).toBe('45 mnt');
  });

  it('125 mnt → "2 j 05 mnt"', () => {
    const start = new Date(base).toISOString();
    const end = new Date(new Date(start).getTime() + 125 * 60 * 1000).toISOString();
    expect(formatRunDuration(start, end)).toBe('2 j 05 mnt');
  });

  it('end < start → "—"', () => {
    expect(formatRunDuration('2026-09-22T12:00:00Z', '2026-09-22T10:00:00Z')).toBe('—');
  });

  it('ISO rusak → "—"', () => {
    expect(formatRunDuration('bukan-iso', '2026-09-22T10:00:00Z')).toBe('—');
    expect(formatRunDuration(null, '2026-09-22T10:00:00Z')).toBe('—');
    expect(formatRunDuration(null, null)).toBe('—');
  });
});
