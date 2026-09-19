import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_BITS,
  localWeekdayIndex,
  weekdayBit,
  isSlotDue,
  mergeSlotParams,
  type SlotRow
} from './schedules';
import type { AutomationConfig } from './config';

function baseCfg(over: Partial<AutomationConfig> = {}): AutomationConfig {
  return {
    id: 1,
    isEnabled: true,
    scheduleHour: 10,
    scheduleMinute: 0,
    timezone: 'Asia/Jakarta',
    scheduleWindowMinutes: 180,
    mechanism: 'dua',
    platformSlugs: ['artikel'],
    templateSlug: null,
    maxTopics: 1,
    language: 'both',
    tone: 'casual',
    audience: 'umum',
    purpose: 'x',
    ctaStyle: 'soft_sell',
    targetReplyCount: null,
    productPoolSize: 50,
    productCategory: null,
    ideaGenerationEnabled: false,
    ideaProductSearch: true,
    requireCover: true,
    coverMaxWaitMinutes: 60,
    coverMaxAttempts: 3,
    autoPublishArticle: true,
    maxRetryAttempts: 3,
    notifyOn: 'both',
    notifyEmails: [],
    emailFrom: 'Asharu <updates@alamaby.com>',
    emailReplyTo: null,
    maxIterations: 1,
    minScore: null,
    minCandidates: null,
    freshnessHours: null,
    ...over
  };
}

function baseSlot(over: Partial<SlotRow> = {}): SlotRow {
  return {
    id: 'slot-1',
    slot_key: 'pagi',
    label: 'Pagi',
    hour: 7,
    minute: 0,
    weekdays: 127,
    is_enabled: true,
    window_minutes: null,
    priority: 0,
    platform_slugs: null,
    max_topics: null,
    product_pool_size: null,
    product_category: null,
    auto_publish_article: null,
    require_cover: null,
    notify_on: null,
    notify_emails: null,
    maximum_iterations: null,
    minimum_score: null,
    minimum_candidates: null,
    freshness_hours: null,
    cover_max_wait_minutes: null,
    cover_max_attempts: null,
    max_retry_attempts: null,
    language: null,
    tone: null,
    audience: null,
    purpose: null,
    cta_style: null,
    target_reply_count: null,
    template_slug: null,
    idea_generation_enabled: null,
    idea_product_search: null,
    email_from: null,
    email_reply_to: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

describe('weekdayBit / localWeekdayIndex', () => {
  it('Senin -> bit 1 (mon)', () => {
    // 2026-09-14 adalah Senin 00:00 UTC = 07:00 WIB
    expect(localWeekdayIndex(new Date('2026-09-14T00:00:00Z'), 'Asia/Jakarta')).toBe(0);
    expect(weekdayBit(new Date('2026-09-14T00:00:00Z'), 'Asia/Jakarta')).toBe(WEEKDAY_BITS.mon);
  });

  it('Minggu -> bit 6 (sun)', () => {
    // 2026-09-13 adalah Minggu 00:00 UTC = 07:00 WIB
    expect(localWeekdayIndex(new Date('2026-09-13T00:00:00Z'), 'Asia/Jakarta')).toBe(6);
    expect(weekdayBit(new Date('2026-09-13T00:00:00Z'), 'Asia/Jakarta')).toBe(WEEKDAY_BITS.sun);
  });

  it('Sabtu -> bit 5 (sat)', () => {
    // 2026-09-12 adalah Sabtu 00:00 UTC = 07:00 WIB
    expect(weekdayBit(new Date('2026-09-12T00:00:00Z'), 'Asia/Jakarta')).toBe(WEEKDAY_BITS.sat);
  });

  it('Jumat (bit 4) tidak cocok dengan weekdays=31 (Sen–Jum)', () => {
    const bit = weekdayBit(new Date('2026-09-11T00:00:00Z'), 'Asia/Jakarta');
    expect(bit).toBe(WEEKDAY_BITS.fri);
    expect((bit & 31)).not.toBe(0); // Jumat termasuk Senin–Jumat
  });
});

describe('isSlotDue', () => {
  it('true bila weekday cocok + jam dalam window', () => {
    // Bangun slot langsung tanpa baseSlot agar override terjamin.
    const slot: SlotRow = {
      id: 's1', slot_key: 'pagi', label: 'Pagi', hour: 10, minute: 0,
      weekdays: 31, is_enabled: true, window_minutes: null, priority: 0,
      platform_slugs: null, max_topics: null, product_pool_size: null, product_category: null,
      auto_publish_article: null, require_cover: null, notify_on: null, notify_emails: null,
      maximum_iterations: null, minimum_score: null, minimum_candidates: null, freshness_hours: null,
      cover_max_wait_minutes: null, cover_max_attempts: null, max_retry_attempts: null,
      language: null, tone: null, audience: null, purpose: null, cta_style: null,
      target_reply_count: null, template_slug: null, idea_generation_enabled: null,
      idea_product_search: null, email_from: null, email_reply_to: null,
      created_at: '', updated_at: ''
    };
    const now = new Date('2026-09-16T03:05:00Z'); // Rabu 10:05 WIB
    expect(isSlotDue(slot, baseCfg(), now)).toBe(true);
  });

  it('false bila weekday tidak cocok', () => {
    const slot = baseSlot({ hour: 10, minute: 0, weekdays: 96 }); // Sabtu-Minggu saja
    const now = new Date('2026-09-16T03:05:00Z'); // Rabu
    expect(isSlotDue(slot, baseCfg(), now)).toBe(false);
  });

  it('false bila sudah lewat window', () => {
    const slot = baseSlot({ hour: 10, minute: 0, weekdays: 127, window_minutes: 60 });
    const now = new Date('2026-09-16T06:05:00Z'); // Rabu 13:05 WIB (lewat 11:00)
    expect(isSlotDue(slot, baseCfg(), now)).toBe(false);
  });

  it('false bila slot disabled', () => {
    const slot = baseSlot({ is_enabled: false });
    expect(isSlotDue(slot, baseCfg(), new Date())).toBe(false);
  });

  it('menggunakan window slot override bila ada', () => {
    const slot: SlotRow = {
      id: 's1', slot_key: 'pagi', label: 'Pagi', hour: 10, minute: 0,
      weekdays: 127, is_enabled: true, window_minutes: 30, priority: 0,
      platform_slugs: null, max_topics: null, product_pool_size: null, product_category: null,
      auto_publish_article: null, require_cover: null, notify_on: null, notify_emails: null,
      maximum_iterations: null, minimum_score: null, minimum_candidates: null, freshness_hours: null,
      cover_max_wait_minutes: null, cover_max_attempts: null, max_retry_attempts: null,
      language: null, tone: null, audience: null, purpose: null, cta_style: null,
      target_reply_count: null, template_slug: null, idea_generation_enabled: null,
      idea_product_search: null, email_from: null, email_reply_to: null,
      created_at: '', updated_at: ''
    };
    const now = new Date('2026-09-16T03:26:00Z'); // 10:26 WIB — dalam window 30 mnt dari 10:00
    expect(isSlotDue(slot, baseCfg(), now)).toBe(true);
  });
});

describe('mergeSlotParams', () => {
  const cfg = baseCfg({
    maxTopics: 3,
    productPoolSize: 100,
    autoPublishArticle: true,
    requireCover: true,
    notifyOn: 'both',
    notifyEmails: ['admin@example.com'],
    maxIterations: 2,
    minScore: 50,
    language: 'id'
  });

  it('NULL slot field → warisi global', () => {
    const slot = baseSlot();
    const merged = mergeSlotParams(cfg, slot);
    expect(merged.maxTopics).toBe(3);
    expect(merged.productPoolSize).toBe(100);
    expect(merged.language).toBe('id');
    expect(merged.maxIterations).toBe(2);
  });

  it('slot override menggantikan global', () => {
    const slot: SlotRow = {
      ...baseSlot(),
      max_topics: 5,
      product_pool_size: 200,
      auto_publish_article: false,
      require_cover: false,
      notify_on: 'draft_ready' as never,
      language: 'en',
      maximum_iterations: 3,
      minimum_score: 75
    };
    const merged = mergeSlotParams(cfg, slot);
    expect(merged.maxTopics).toBe(5);
    expect(merged.productPoolSize).toBe(200);
    expect(merged.autoPublishArticle).toBe(false);
    expect(merged.requireCover).toBe(false);
    expect(merged.notifyOn).toBe('draft_ready');
    expect(merged.language).toBe('en');
    expect(merged.maxIterations).toBe(3);
    expect(merged.minScore).toBe(75);
  });

  it('array NULL = warisi global (bukan array kosong)', () => {
    const slot = baseSlot({ notify_emails: null });
    const merged = mergeSlotParams(cfg, slot);
    expect(merged.notifyEmails).toEqual(['admin@example.com']);
  });
});
