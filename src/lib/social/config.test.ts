import { describe, expect, it } from 'vitest';
import {
  buildIdempotencyKey,
  effectiveLang,
  extractThreadTexts,
  nextSlot,
  parseWindowTime,
  resolveAccount,
  type SocialAccount,
  type SocialPostConfig
} from './config';

const baseConfig: SocialPostConfig = {
  platform_slug: 'threads',
  is_enabled: true,
  auto_queue_on_approve: true,
  default_lang: 'id',
  allow_lang_override: true,
  daily_cap: 25,
  post_window_start: '07:00',
  post_window_end: '21:00',
  min_interval_minutes: 30,
  account_id: null
};

const accounts: SocialAccount[] = [
  {
    id: 'a1',
    platform_slug: 'threads',
    handle: '@asharu.id',
    threads_user_id: '123',
    vault_secret_name: 'threads_access_token_asharu_id',
    scopes: [],
    token_expires_at: null,
    status: 'active',
    priority: 20,
    is_active: true
  },
  {
    id: 'a2',
    platform_slug: 'threads',
    handle: '@asharu.cadangan',
    threads_user_id: null,
    vault_secret_name: 'threads_access_token_cadangan',
    scopes: [],
    token_expires_at: null,
    status: 'active',
    priority: 10,
    is_active: true
  }
];

describe('social config helpers', () => {
  it('builds a stable idempotency key', () => {
    expect(buildIdempotencyKey('draft-1', 'threads')).toBe('draft-1:threads');
  });

  it('resolves account: queue pin > config pin > priority waterfall', () => {
    expect(resolveAccount(baseConfig, accounts, 'a1')?.id).toBe('a1');
    expect(
      resolveAccount({ ...baseConfig, account_id: 'a1' }, accounts, null)?.id
    ).toBe('a1');
    expect(resolveAccount(baseConfig, accounts, null)?.id).toBe('a2');
    expect(resolveAccount(baseConfig, [], null)).toBeNull();
    expect(
      resolveAccount(
        baseConfig,
        accounts.map((a) => ({ ...a, is_active: false })),
        null
      )
    ).toBeNull();
  });

  it('parses window times', () => {
    expect(parseWindowTime('07:00')).toBe(420);
    expect(parseWindowTime('21:30')).toBe(1290);
    expect(parseWindowTime('invalid')).toBeNull();
    expect(parseWindowTime('25:00')).toBeNull();
  });

  it('schedules inside the window and rolls to next day when past', () => {
    const morning = new Date('2026-09-06T06:00:00');
    expect(nextSlot(morning, null, baseConfig).getHours()).toBe(7);

    const evening = new Date('2026-09-06T22:00:00');
    const rolled = nextSlot(evening, null, baseConfig);
    expect(rolled.getDate()).toBe(7);
    expect(rolled.getHours()).toBe(7);

    const midday = new Date('2026-09-06T10:00:00');
    const last = new Date('2026-09-06T09:50:00');
    const spaced = nextSlot(midday, last, baseConfig);
    expect(spaced.getHours()).toBe(10);
    expect(spaced.getMinutes()).toBe(20);
  });

  it('extracts thread texts per language', () => {
    const thread = {
      main: { id: 'Halo', en: 'Hello' },
      replies: [{ id: 'Lanjut', en: 'More' }, { id: '  ', en: 'Tail' }]
    };
    expect(extractThreadTexts(thread, 'id')).toEqual(['Halo', 'Lanjut']);
    expect(extractThreadTexts(thread, 'en')).toEqual(['Hello', 'More', 'Tail']);
  });

  it('resolves effective language with override flag', () => {
    expect(effectiveLang(baseConfig, 'en')).toBe('en');
    expect(effectiveLang({ ...baseConfig, allow_lang_override: false }, 'en')).toBe('id');
    expect(effectiveLang(baseConfig, null)).toBe('id');
  });
});
