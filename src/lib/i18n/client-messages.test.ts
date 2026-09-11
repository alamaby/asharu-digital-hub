import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIENT_MESSAGE_NAMESPACES, pickClientMessages } from './client-messages';
import type { AbstractIntlMessages } from 'next-intl';

const catalog = {
  header: { skipToContent: 'x', language: 'y' },
  nav: { home: 'Beranda' },
  property: {
    sale: 'Dijual',
    gallery: { heading: 'Galeri' }
  },
  footer: { rights: '© {year}' },
  meta: { home: { title: 'T' } }
} as unknown as AbstractIntlMessages;

describe('pickClientMessages', () => {
  it('keeps only allow-listed namespaces (deep objects intact)', () => {
    const picked = pickClientMessages(catalog);
    expect(Object.keys(picked).sort()).toEqual(['header', 'nav', 'property']);
    expect(picked.property).toEqual(catalog.property);
  });

  it('includes the studio namespace for the studio page', () => {
    expect(CLIENT_MESSAGE_NAMESPACES).toContain('studio');
    const picked = pickClientMessages({ studio: { title: 'Studio' }, footer: { x: 'y' } });
    expect(Object.keys(picked)).toEqual(['studio']);
  });

  it('skips namespaces missing from the catalog', () => {
    const picked = pickClientMessages({ header: { a: 'b' } });
    expect(Object.keys(picked)).toEqual(['header']);
  });

  it('supports a custom namespace list', () => {
    const picked = pickClientMessages(catalog, ['footer', 'meta']);
    expect(Object.keys(picked).sort()).toEqual(['footer', 'meta']);
  });

  it('returns an empty object when nothing matches', () => {
    expect(pickClientMessages({ unrelated: {} })).toEqual({});
  });
});

/**
 * Regresi insiden `studio.*` (label mentah di UI karena namespace lupa
 * didaftarkan): setiap namespace yang dipakai komponen client WAJIB ada di
 * CLIENT_MESSAGE_NAMESPACES, karena locale layout memangkas katalog via
 * allow-list itu sebelum meneruskannya ke NextIntlClientProvider.
 *
 * Batasan yang disengaja: hanya file berdirektif 'use client' (plus
 * error/loading boundary) yang dipindai. Komponen server tanpa direktif yang
 * memakai namespace non-allow-list lalu diimpor komponen client tidak
 * tertangkap — pola itu belum pernah terjadi di repo ini (setiap file yang
 * butuh hook selalu client).
 */
describe('client namespace coverage', () => {
  const srcDir = resolve(process.cwd(), 'src');
  // Root namespace literal, mis. useTranslations('content.review') -> 'content'.
  const literalCall = /useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g;
  const clientBoundary = /['"]use client['"]/;
  const boundaryFile = /(^|[\\/])(error|loading|not-found|global-error)\.tsx$/;

  interface Usage {
    namespace: string;
    file: string;
  }

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        out.push(...sourceFiles(full));
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  function usages(): { used: Usage[]; dynamic: string[] } {
    const used: Usage[] = [];
    const dynamic: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(process.cwd(), file);
      const isClient = clientBoundary.test(src) || boundaryFile.test(file);
      if (!isClient) continue;
      // Salin regex global per file agar lastIndex tidak bocor antar file.
      let m: RegExpExecArray | null;
      const lit = new RegExp(literalCall);
      while ((m = lit.exec(src)) !== null) {
        used.push({ namespace: m[1]!.split('.')[0]!, file: rel });
      }
      const total = (src.match(/useTranslations\(/g) ?? []).length;
      const literal = (src.match(new RegExp(literalCall.source, 'g')) ?? []).length;
      if (total > literal) dynamic.push(rel);
    }
    return { used, dynamic };
  }

  const { used, dynamic } = usages();
  const allowList = new Set<string>(CLIENT_MESSAGE_NAMESPACES);
  const idCatalog = JSON.parse(
    readFileSync(resolve(srcDir, 'messages', 'id.json'), 'utf8')
  ) as Record<string, unknown>;

  it('menolak argumen dinamis useTranslations (tak terdeteksi statis)', () => {
    expect(dynamic).toEqual([]);
  });

  it('setiap namespace client terdaftar di allow-list', () => {
    const missing = used.filter((u) => !allowList.has(u.namespace));
    expect(
      missing.map((u) => `${u.namespace} (dipakai ${u.file})`),
      'tambahkan ke CLIENT_MESSAGE_NAMESPACES agar tidak jadi label mentah'
    ).toEqual([]);
  });

  it('setiap namespace client ada di katalog id.json (anti typo)', () => {
    const unknown = used.filter((u) => !(u.namespace in idCatalog));
    expect(unknown.map((u) => `${u.namespace} (dipakai ${u.file})`)).toEqual([]);
  });

  it('setiap entri allow-list ada di katalog (anti typo allow-list)', () => {
    const stale = [...allowList].filter((ns) => !(ns in idCatalog));
    expect(stale).toEqual([]);
  });
});
