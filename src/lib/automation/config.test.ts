import { describe, expect, it } from 'vitest';
import { mapConfigRow, resolveRunLocales } from './config';

const base = {
  id: 1,
  is_enabled: true,
  schedule_hour: 10,
  schedule_minute: 0,
  timezone: 'Asia/Jakarta',
  schedule_window_minutes: 180,
  mechanism: 'dua',
  platform_slugs: ['artikel', 'twitter', 'threads'],
  template_slug: null,
  max_topics: 1,
  language: 'both',
  tone: 'casual',
  audience: 'umum',
  purpose: 'membagikan informasi bermanfaat',
  cta_style: 'soft_sell',
  target_reply_count: null,
  product_pool_size: 50,
  product_category: null,
  require_cover: true,
  cover_max_wait_minutes: 60,
  cover_max_attempts: 3,
  auto_publish_article: true,
  max_retry_attempts: 3,
  notify_on: 'both',
  notify_emails: ['admin@asharu.id'],
  email_from: 'Asharu <notifikasi@asharu.id>',
  email_reply_to: null
};

describe('mapConfigRow', () => {
  it('memetakan kolom snake_case → camelCase', () => {
    const cfg = mapConfigRow(base);
    expect(cfg.isEnabled).toBe(true);
    expect(cfg.platformSlugs).toEqual(['artikel', 'twitter', 'threads']);
    expect(cfg.productPoolSize).toBe(50);
    expect(cfg.notifyOn).toBe('both');
    expect(cfg.notifyEmails).toEqual(['admin@asharu.id']);
  });

  it('mechanism tak dikenal jatuh ke dua + notify_on tak valid → none', () => {
    const cfg = mapConfigRow({ ...base, mechanism: 'aneh', notify_on: 'kadang' });
    expect(cfg.mechanism).toBe('dua');
    expect(cfg.notifyOn).toBe('none');
  });

  it('platform_slugs/notify_emails null → array kosong', () => {
    const cfg = mapConfigRow({ ...base, platform_slugs: null, notify_emails: null });
    expect(cfg.platformSlugs).toEqual([]);
    expect(cfg.notifyEmails).toEqual([]);
  });

  it('single language tetap dipertahankan', () => {
    expect(mapConfigRow({ ...base, language: 'id' }).language).toBe('id');
  });
});

describe('resolveRunLocales', () => {
  it('both/null → id+en', () => {
    expect(resolveRunLocales('both')).toEqual(['id', 'en']);
    expect(resolveRunLocales(null)).toEqual(['id', 'en']);
  });
  it('id → hanya id; en → hanya en', () => {
    expect(resolveRunLocales('id')).toEqual(['id']);
    expect(resolveRunLocales('en')).toEqual(['en']);
  });
});
