import { describe, expect, it } from 'vitest';
import {
  isRunDue,
  localDateString,
  localMinutes,
  pickRandomIndex,
  pickRandomProduct
} from './scheduler';

describe('localDateString / localMinutes', () => {
  it('menghitung tanggal & menit lokal Asia/Jakarta (UTC+7)', () => {
    // 2026-09-16T02:59:00Z = 2026-09-16 09:59 WIB
    const d = new Date('2026-09-16T02:59:00Z');
    expect(localDateString(d, 'Asia/Jakarta')).toBe('2026-09-16');
    expect(localMinutes(d, 'Asia/Jakarta')).toBe(9 * 60 + 59);
  });

  it('rollover tengah malam lokal: 17:00Z = 00:00 WIB hari berikutnya', () => {
    const d = new Date('2026-09-15T17:00:00Z');
    expect(localDateString(d, 'Asia/Jakarta')).toBe('2026-09-16');
    expect(localMinutes(d, 'Asia/Jakarta')).toBe(0);
  });

  it('timezone tak valid melempar pesan jelas', () => {
    expect(() => localMinutes(new Date(), 'Zona/Palsu')).toThrow(/timezone tidak valid/);
  });
});

describe('isRunDue', () => {
  const cfg = {
    scheduleHour: 10,
    scheduleMinute: 0,
    timezone: 'Asia/Jakarta',
    scheduleWindowMinutes: 180
  };

  it('false sebelum jam target', () => {
    // 09:59 WIB
    expect(isRunDue(cfg, new Date('2026-09-16T02:59:00Z'))).toBe(false);
  });

  it('true tepat pada jam target', () => {
    // 10:00 WIB
    expect(isRunDue(cfg, new Date('2026-09-16T03:00:00Z'))).toBe(true);
  });

  it('true di dalam jendela', () => {
    // 12:59 WIB (masih < 13:00)
    expect(isRunDue(cfg, new Date('2026-09-16T05:59:00Z'))).toBe(true);
  });

  it('false setelah jendela lewat', () => {
    // 13:00 WIB
    expect(isRunDue(cfg, new Date('2026-09-16T06:00:00Z'))).toBe(false);
  });

  it('startMinutes eksplisit untuk test deterministik', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isRunDue(cfg, now, 600)).toBe(true);
    expect(isRunDue(cfg, now, 599)).toBe(false);
    expect(isRunDue(cfg, now, 780)).toBe(false);
  });
});

describe('pickRandomIndex / pickRandomProduct', () => {
  it('selalu 0 untuk satu kandidat tanpa memanggil rng', () => {
    expect(pickRandomIndex(1)).toBe(0);
  });

  it('menghormati rng yang disuntik dan menormalkan indeks', () => {
    expect(pickRandomIndex(5, () => 7)).toBe(2);
    expect(pickRandomIndex(5, () => -1)).toBe(4);
  });

  it('melempar untuk kandidat kosong', () => {
    expect(() => pickRandomIndex(0)).toThrow(/kosong/);
  });

  it('mengembalikan elemen dari daftar', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickRandomProduct(rows, () => 1)).toEqual({ id: 'b' });
    expect(pickRandomProduct([], () => 0)).toBeNull();
  });

  it('default rng (crypto) menghasilkan indeks dalam rentang', () => {
    for (let i = 0; i < 20; i++) {
      const idx = pickRandomIndex(10);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(10);
    }
  });
});
