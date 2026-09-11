import { describe, expect, it } from 'vitest';
import { isNavActive, type AdminNavEntry } from './admin-nav';

const entry = (pathname: string, exact?: boolean): AdminNavEntry =>
  ({
    key: 'adminKonten',
    pathname,
    icon: (() => null) as unknown as AdminNavEntry['icon'],
    adminOnly: true,
    exact
  }) as AdminNavEntry;

describe('isNavActive', () => {
  it('exact match only on identical path', () => {
    expect(isNavActive('/admin', entry('/admin', true))).toBe(true);
    expect(isNavActive('/admin/konten', entry('/admin', true))).toBe(false);
  });

  it('prefix match covers parent and detail pages', () => {
    expect(isNavActive('/admin/konten', entry('/admin/konten'))).toBe(true);
    expect(isNavActive('/admin/riset/abc/topics/def', entry('/admin/riset'))).toBe(true);
  });

  it('does not match sibling prefixes', () => {
    expect(isNavActive('/admin/kontenx', entry('/admin/konten'))).toBe(false);
    expect(isNavActive('/admin', entry('/admin/konten'))).toBe(false);
  });
});
