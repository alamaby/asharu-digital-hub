import { describe, expect, it } from 'vitest';
import { estimateReadingMinutes } from './reading-time';

describe('estimateReadingMinutes', () => {
  it('string kosong kembali 1', () => {
    expect(estimateReadingMinutes('')).toBe(1);
  });

  it('string kosong total Kembali 1', () => {
    expect(estimateReadingMinutes('   ')).toBe(1);
  });

  it('1 sampai 200 kata kembali 1', () => {
    expect(estimateReadingMinutes('satu dua')).toBe(1);
    expect(estimateReadingMinutes(Array.from({ length: 200 }, (_, i) => `kata${i}`).join(' '))).toBe(1);
  });

  it('201 kata kembali 2', () => {
    expect(estimateReadingMinutes(Array.from({ length: 201 }, (_, i) => `kata${i}`).join(' '))).toBe(2);
  });

  it('1000 kata kembali 5', () => {
    expect(estimateReadingMinutes(Array.from({ length: 1000 }, (_, i) => `kata${i}`).join(' '))).toBe(5);
  });
});
