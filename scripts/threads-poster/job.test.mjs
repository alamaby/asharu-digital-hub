import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeDelays, parseDelayFlag, parseJobFile, validateJob } from './job.mjs';

const tempDir = () => mkdtempSync(join(tmpdir(), 'threads-job-'));

describe('parseJobFile', () => {
  it('throws a precise error when the file is missing', () => {
    const dir = tempDir();
    const path = join(dir, 'nope.json');
    expect(() => parseJobFile(path)).toThrow(`job file ${path} not found`);
  });

  it('throws a precise error when the JSON is invalid', () => {
    const dir = tempDir();
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{oops', 'utf8');
    expect(() => parseJobFile(path)).toThrow(`job file ${path} is not valid JSON`);
  });

  it('parses a job with no delays section into the production defaults', () => {
    const dir = tempDir();
    const path = join(dir, 'job.json');
    writeFileSync(path, JSON.stringify({ text: 'halo' }), 'utf8');
    const job = parseJobFile(path);
    expect(job.text).toBe('halo');
    expect(mergeDelays(job.delays, {})).toEqual({
      action: { minSec: 4, maxSec: 12 },
      publish: { minSec: 300, maxSec: 600 }
    });
  });
});

describe('parseDelayFlag', () => {
  it('accepts the documented "min,max" format', () => {
    expect(parseDelayFlag('4,12', 'action')).toEqual({ minSec: 4, maxSec: 12 });
    expect(parseDelayFlag('600,300', 'publish')).toEqual({ minSec: 600, maxSec: 300 });
  });

  it('throws a precise error for malformed values', () => {
    expect(() => parseDelayFlag('abc', 'action')).toThrow(
      'invalid --action-delay "abc", expected "min,max" in seconds'
    );
    expect(() => parseDelayFlag('4-12', 'publish')).toThrow(
      'invalid --publish-delay "4-12", expected "min,max" in seconds'
    );
  });
});

describe('mergeDelays', () => {
  it('lets the CLI override one knob entirely while the job keeps the other', () => {
    const job = {
      action: { minSec: 5, maxSec: 9 },
      publish: { minSec: 310, maxSec: 520 }
    };
    const cli = { action: { minSec: 1, maxSec: 2 } };
    expect(mergeDelays(job, cli)).toEqual({
      action: { minSec: 1, maxSec: 2 },
      publish: { minSec: 310, maxSec: 520 }
    });
  });

  it('never mixes a CLI knob partially with a job knob', () => {
    // CLI hanya minSec: harus menang UTUH, bukan digabung dengan maxSec job.
    const merged = mergeDelays({ action: { minSec: 5, maxSec: 9 } }, {
      action: { minSec: 1, maxSec: 1 }
    });
    expect(merged.action).toEqual({ minSec: 1, maxSec: 1 });
  });
});

describe('validateJob', () => {
  it('accepts a minimal job and an empty reply list', () => {
    expect(validateJob({ text: 'halo' })).toEqual([]);
    expect(validateJob({ text: 'halo', replies: [] })).toEqual([]);
  });

  it('reports a precise error when the main text exceeds 500 characters', () => {
    expect(validateJob({ text: 'x'.repeat(501) })).toEqual([
      'job.text exceeds 500 characters'
    ]);
  });

  it('reports per-reply errors with the reply index', () => {
    expect(
      validateJob({ text: 'ok', replies: [{ text: 'aa' }, { text: '  ' }] })
    ).toEqual(['job.replies[1].text must be a non-empty string']);
  });

  it('rejects empty location/topic strings and non-string replies', () => {
    expect(validateJob({ text: 'ok', location: '' })).toEqual([
      'job.location must be a non-empty string or null'
    ]);
    expect(validateJob({ text: 'ok', replies: 'nope' })).toEqual([
      'job.replies must be an array'
    ]);
  });

  it('flushes every delay bound error before the browser opens', () => {
    expect(
      validateJob({ text: 'ok', delays: { action: { minSec: 12, maxSec: 4 } } })
    ).toEqual(['job.delays.action minSec (12) must be <= maxSec (4)']);
  });
});
