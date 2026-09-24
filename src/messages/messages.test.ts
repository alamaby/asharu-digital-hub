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

  it('top-level keys are unique (no duplicate blocks)', () => {
    // 2026-09-24: duplikat "lab" (Endpoint Try) menghapus lab.* saat parse.
    // Asumsi: file memakai indent 2 spasi konsisten sehingga top-level key
    // selalu cocok pola `^  "key":`.
    for (const locale of ['id', 'en'] as const) {
      const raw = readFileSync(resolve(messagesDir, `${locale}.json`), 'utf8');
      const keys = [...raw.matchAll(/^  "([^"]+)":/gm)].map((m) => m[1]);
      expect(new Set(keys).size, `${locale} top-level keys`).toBe(keys.length);
    }
  });

  it('lab namespaces used by components exist', () => {
    const required = [
      'lab.title',
      'lab.form.promptLabel',
      'lab.form.submit',
      'lab.result.heading',
      'lab.history.heading',
      'lab.history.pageOf',
      'lab.history.prev',
      'lab.history.next',
      'lab.history.reuse',
      'lab.history.openDetail',
      'lab.history.delete',
      'lab.stats.heading',
      'lab.notice.running',
      'lab.detail.heading',
      'lab.detail.downloadCard',
      'lab.detail.shareCard',
      'lab.try.title',
      'lab.try.sendButton'
    ];
    for (const [locale, catalog] of [
      ['id', id],
      ['en', en]
    ] as const) {
      for (const key of required) {
        const value = key
          .split('.')
          .reduce<unknown>(
            (acc, part) =>
              acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
            catalog
          );
        expect(typeof value === 'string' && value.length > 0, `${locale}:${key}`).toBe(true);
      }
    }
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
