import { describe, expect, it } from 'vitest';
import { maxDuration as automationMaxDuration } from '@/app/api/automation/run/route';
import { maxDuration as socialMaxDuration } from '@/app/api/social/post/route';
import { maxDuration as studioMaxDuration } from '@/app/api/studio/process/route';
import { maxDuration as imageMaxDuration } from '@/app/api/image/generate/route';
import { maxDuration as contentMaxDuration } from '@/app/api/content/process/route';
import { maxDuration as legacyMaxDuration } from '@/app/api/content/process-legacy/route';
import { maxDuration as digestMaxDuration } from '@/app/api/notifications/error-digest/route';

describe('cron route maxDuration invariants', () => {
  it('poller ringan memakai maxDuration yang dioptimasi', () => {
    expect(automationMaxDuration).toBe(120);
    expect(socialMaxDuration).toBe(120);
    expect(studioMaxDuration).toBe(180);
  });

  it('worker berat dan cron lama mempertahankan maxDuration semula', () => {
    expect(imageMaxDuration).toBe(300);
    expect(contentMaxDuration).toBe(300);
    expect(legacyMaxDuration).toBe(60);
    expect(digestMaxDuration).toBe(60);
  });
});
