import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const messagesDir = resolve(process.cwd(), 'src/messages');

function load(locale: string): Record<string, Record<string, unknown>> {
  return JSON.parse(readFileSync(resolve(messagesDir, `${locale}.json`), 'utf8')) as Record<
    string,
    Record<string, unknown>
  >;
}

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('message catalogs', () => {
  const id = load('id');
  const en = load('en');

  it('id and en share identical key sets (full parity)', () => {
    const idKeys = flatten(id).sort();
    const enKeys = flatten(en).sort();
    expect(enKeys).toEqual(idKeys);
  });

  it('no empty translation values', () => {
    for (const [locale, catalog] of [
      ['id', id],
      ['en', en]
    ] as const) {
      for (const key of flatten(catalog)) {
        const value = key
          .split('.')
          .reduce<unknown>(
            (acc, part) =>
              acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
            catalog
          );
        expect(`${locale}:${key}`, String(value ?? '')).not.toBe('');
      }
    }
  });

  it('homepage metadata matches the spec examples', () => {
    const idHome = id.meta?.home as { title: string };
    const enHome = en.meta?.home as { title: string };
    expect(idHome.title).toBe(
      'Asharu | Toko, Produk Pilihan, Media Sosial & Properti'
    );
    expect(enHome.title).toBe(
      'Asharu | Shops, Curated Products, Social Media & Properties'
    );
  });
});
