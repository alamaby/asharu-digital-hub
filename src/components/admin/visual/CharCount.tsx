'use client';

/**
 * Counter karakter ringan untuk form admin visual.
 * `min` > 0 menandai input yang belum mencapai panjang minimum (amber).
 */
export function CharCount({ current, max, min = 0 }: { current: number; max: number; min?: number }) {
  const over = current > max;
  const under = min > 0 && current > 0 && current < min;
  return (
    <span
      className={`text-[11px] tabular-nums ${over ? 'font-semibold text-red-700' : under ? 'text-amber-700' : 'text-ink-muted'}`}
      title={over ? `${current} karakter, melebihi batas ${max}` : `${current} dari maks ${max} karakter`}
    >
      {current}/{max}
    </span>
  );
}
