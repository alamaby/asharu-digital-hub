import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ACTION_DELAY,
  DEFAULT_PUBLISH_DELAY,
  actionDelayMs,
  publishDelayMs,
  randomSec,
  sleep
} from './delays.mjs';

describe('randomSec', () => {
  it('returns the inclusive min for rng 0 and the max for rng just below 1', () => {
    expect(randomSec(4, 12, () => 0)).toBe(4);
    expect(randomSec(4, 12, () => 0.999999)).toBe(12);
    expect(randomSec(300, 600, () => 0.5)).toBe(450);
  });

  it('stays inside bounds for 200 production-action samples', () => {
    for (let i = 0; i < 200; i += 1) {
      const sec = randomSec(DEFAULT_ACTION_DELAY.minSec, DEFAULT_ACTION_DELAY.maxSec);
      expect(sec).toBeGreaterThanOrEqual(4);
      expect(sec).toBeLessThanOrEqual(12);
      expect(Number.isInteger(sec)).toBe(true);
    }
  });

  it('stays inside bounds for 200 production-publish samples', () => {
    for (let i = 0; i < 200; i += 1) {
      const sec = randomSec(DEFAULT_PUBLISH_DELAY.minSec, DEFAULT_PUBLISH_DELAY.maxSec);
      expect(sec).toBeGreaterThanOrEqual(300);
      expect(sec).toBeLessThanOrEqual(600);
    }
  });

  it('throws a precise error when minSec > maxSec', () => {
    expect(() => randomSec(12, 4)).toThrow('delay minSec (12) must be <= maxSec (4)');
  });

  it('throws a precise error for negative bounds', () => {
    expect(() => randomSec(-1, 5)).toThrow('delay bounds must be non-negative integers (minSec=-1)');
  });
});

describe('actionDelayMs / publishDelayMs', () => {
  it('sleeps the converted ms and returns the ms actually used', async () => {
    const slept = [];
    const sleepImpl = vi.fn(async (ms) => {
      slept.push(ms);
    });

    const actionMs = await actionDelayMs({ minSec: 4, maxSec: 4 }, () => 0, sleepImpl);
    expect(actionMs).toBe(4000);
    expect(slept).toEqual([4000]);

    const publishMs = await publishDelayMs({ minSec: 300, maxSec: 300 }, () => 0, sleepImpl);
    expect(publishMs).toBe(300000);
    expect(slept).toEqual([4000, 300000]);
  });

  it('rejects non-finite sleep values', () => {
    expect(() => sleep(Number.NaN)).toThrow('sleep ms must be a non-negative finite number');
    expect(() => sleep(-5)).toThrow('sleep ms must be a non-negative finite number');
  });
});
