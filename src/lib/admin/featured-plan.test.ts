import { describe, expect, it } from 'vitest';
import { planFeaturedOverride, MAX_CURATED } from './featured-plan';

const NOW = '2026-09-16T10:00:00Z';
const OLDER = '2026-09-15T08:00:00Z';

const make = (id: string, code: string, override: boolean | null = null, at: string | null = null) => ({
  id,
  friendly_code: code,
  featured_override: override,
  featured_override_at: at
});

describe('planFeaturedOverride', () => {
  it('auto mode clears override (set null)', () => {
    const result = planFeaturedOverride([], 'p1', 'auto', NOW);
    expect(result.setTarget).toEqual({ id: 'p1', override: null, at: null });
    expect(result.release).toBeNull();
  });

  it('exclude mode sets override=false without swap', () => {
    const result = planFeaturedOverride([make('p1', 'A', true, NOW)], 'p1', 'exclude', NOW);
    expect(result.setTarget).toEqual({ id: 'p1', override: false, at: null });
    expect(result.release).toBeNull();
  });

  it('pin when slot kosong -> set target with now, no release', () => {
    const result = planFeaturedOverride([make('p1', 'A', true, OLDER)], 'p2', 'pin', NOW);
    expect(result.setTarget).toEqual({ id: 'p2', override: true, at: NOW });
    expect(result.release).toBeNull();
  });

  it('pin when already pinned -> no-op, keeps original at', () => {
    const input = [make('p1', 'A', true, OLDER)];
    const result = planFeaturedOverride(input, 'p1', 'pin', NOW);
    expect(result.setTarget).toEqual({ id: 'p1', override: true, at: OLDER });
    expect(result.release).toBeNull();
  });

  it('pin to full -> releases oldest pinned (by at ASC, nulls last)', () => {
    // Bangun 6 pinned dengan timestamp berbeda + 2 null-at. Total 8 baris, pinned=true=8 >= 6.
    const oldAt = '2026-09-10T00:00:00Z';
    const midAt = '2026-09-12T00:00:00Z';
    const pinned = [
      make('a-old', 'A', true, oldAt),     // id paling kecil di group OLD → menang tie-break
      make('mid', 'B', true, midAt),       // tengah
      make('newest', 'C', true, NOW),      // baru
      make('z-null-1', 'D', true, null),   // null = terbaru (di akhir sorted)
      make('z-null-2', 'E', true, null),   // null = terbaru (di akhir sorted)
      // tambah 3 lagi supaya total >= 6
      make('fill-1', 'F', true, oldAt),
      make('fill-2', 'G', true, oldAt),
      make('fill-3', 'H', true, midAt)
    ];
    // pinned count = 8 >= 6 → swap wajib
    // Sorted ASC: a-old(OLD), fill-1(OLD), fill-2(OLD), mid(MID), fill-3(MID), newest(NOW), z-null-1(null), z-null-2(null)
    // Oldest = 'a-old'
    const result = planFeaturedOverride(pinned, 'target', 'pin', NOW);
    expect(result.setTarget).toEqual({ id: 'target', override: true, at: NOW });
    expect(result.release).not.toBeNull();
    expect(result.release!.id).toBe('a-old');
  });

  it('when multiple pinned have same at & same at as others, tie-break by id ASC', () => {
    // Semua sama OLDER → tie-break id: 'a-item' < 'b-item'
    const sameAt = [make('b-item', 'B', true, OLDER), make('a-item', 'A', true, OLDER)];
    const full = [...sameAt];
    for (let i = 0; i < MAX_CURATED - 2; i++) {
      full.push(make(`base-${i}`, `x-${i}`, true, OLDER));
    }
    const result = planFeaturedOverride(full, 'p-target', 'pin', NOW);
    expect(result.release).not.toBeNull();
    // 'a-item' < 'b-item' < 'base-0' ... secara leksikografis
    expect(result.release!.id).toBe('a-item');
  });

  it('ignores non-pinned rows in pinned list', () => {
    const mixed = [
      make('p1', 'A', true, NOW),
      make('p2', 'B', false, null),
      make('p3', 'C', null, null),
      make('p4', 'D', true, NOW)
    ];
    const result = planFeaturedOverride(mixed, 'p5', 'pin', NOW);
    expect(result.setTarget.override).toBe(true);
    expect(result.release).toBeNull();
  });

  it('null-featured_override_at dianggap paling muda (tidak dilepas duluan)', () => {
    // 'old-z' supaya > 'fill-0' secara leksikografis, sehingga fill-0 bisa diuji sebagai tie-break.
    // Namun karena 'old-z' punya OLDER dan fill-0 juga OLDER, maka tie-break = id ASC: 'fill-0' < 'old-z'.
    // Kita ingin verify bahwa NULL-TIMESTAMP selalu diakhir (tidak dilepas duluan).
    const pinned = [
      make('old', 'A', true, OLDER),
      make('new-no-at', 'B', true, null)
    ];
    const full = [...pinned];
    for (let i = 0; i < MAX_CURATED - 2; i++) {
      full.push(make(`fill-${i}`, `f-${i}`, true, OLDER));
    }
    // Total: old(OLDER), new-no-at(NULL), fill-0..3(OLDER) = 6 pinned, pin target memicu swap.
    // Sorted: fill-0(OLDER), fill-1(OLDER), fill-2(OLDER), fill-3(OLDER), old(OLDER), new-no-at(NULL)
    // Release = fill-0 (id ASC tie-break), BUKAN new-no-at → null-at memang paling muda.
    const result = planFeaturedOverride(full, 'target', 'pin', NOW);
    expect(result.release).not.toBeNull();
    expect(result.release!.id).not.toBe('new-no-at'); // bukan yang null-at
    expect(result.release!.id).toBe('fill-0');        // tie-break id ASC
  });
});
