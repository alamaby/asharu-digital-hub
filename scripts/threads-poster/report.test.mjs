import { describe, expect, it, vi } from 'vitest';
import {
  REPORT_NAME_RE,
  createReport,
  isThreadsUrl,
  recordPost,
  saveReport
} from './report.mjs';

const effectiveDelays = {
  action: { minSec: 4, maxSec: 12 },
  publish: { minSec: 300, maxSec: 600 }
};

describe('isThreadsUrl', () => {
  it('matches only the canonical www.threads.com origin (same rule as markQueuePosted)', () => {
    expect(isThreadsUrl('https://www.threads.com/@asharu.id/post/ABC123')).toBe(true);
    expect(isThreadsUrl('https://threads.com/@asharu.id/post/ABC123')).toBe(false);
    expect(isThreadsUrl('https://www.threads.net/@asharu.id/post/ABC123')).toBe(false);
    expect(isThreadsUrl(undefined)).toBe(false);
  });
});

describe('recordPost', () => {
  it('fills mainUrl first, then appends replies', () => {
    const report = createReport('job.example.json', effectiveDelays);
    recordPost(report, 'https://www.threads.com/@asharu.id/post/MAIN');
    recordPost(report, 'https://www.threads.com/@asharu.id/post/R1');
    recordPost(report, 'https://www.threads.com/@asharu.id/post/R2');

    expect(report.mainUrl).toBe('https://www.threads.com/@asharu.id/post/MAIN');
    expect(report.replies).toEqual([
      'https://www.threads.com/@asharu.id/post/R1',
      'https://www.threads.com/@asharu.id/post/R2'
    ]);
  });

  it('throws a precise error for a non-threads URL', () => {
    const report = createReport('job.example.json', effectiveDelays);
    expect(() => recordPost(report, 'https://twitter.com/x/status/1')).toThrow(
      'refusing to record non-threads URL: https://twitter.com/x/status/1'
    );
  });
});

describe('saveReport', () => {
  it('writes a stable report-YYYYMMDD-HHmmss.json name and valid JSON payload', () => {
    const report = createReport('job.example.json', effectiveDelays);
    report.dryRun = true;
    recordPost(report, 'https://www.threads.com/@asharu.id/post/MAIN');
    const writeImpl = vi.fn();

    const path = saveReport(report, 'reports', writeImpl);

    const name = path.split(/[\\/]/).pop();
    expect(name).toMatch(REPORT_NAME_RE);
    expect(JSON.parse(writeImpl.mock.calls[0][1])).toMatchObject({
      job: 'job.example.json',
      dryRun: true,
      mainUrl: 'https://www.threads.com/@asharu.id/post/MAIN',
      replies: []
    });
    expect(report.finishedAt).not.toBeNull();
  });
});
