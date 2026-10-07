import { describe, expect, it } from 'vitest';
import {
  getRouteClass,
  getLocaleFromPathname,
  isAdminRoute,
  isLoginOnlyRoute,
  isPublicRoute,
  localizeToInternal,
  stripLocalePrefix,
  toInternalPath
} from './route-guards';

describe('stripLocalePrefix / getLocaleFromPathname', () => {
  it('membuang prefix locale', () => {
    expect(stripLocalePrefix('/id/produk')).toBe('/produk');
    expect(stripLocalePrefix('/en')).toBe('/');
    expect(stripLocalePrefix('/id')).toBe('/');
  });

  it('mendeteksi locale untuk target redirect', () => {
    expect(getLocaleFromPathname('/en/admin')).toBe('en');
    expect(getLocaleFromPathname('/id/admin')).toBe('id');
    expect(getLocaleFromPathname('/admin')).toBe('id');
  });
});

describe('localizeToInternal', () => {
  it('memetakan pathname lokal kembali ke kunci internal', () => {
    expect(localizeToInternal('/produk')).toBe('/products');
    expect(localizeToInternal('/properti/rumah-x')).toBe('/properties/rumah-x');
    expect(localizeToInternal('/articles')).toBe('/artikel');
    expect(localizeToInternal('/articles/judul-a')).toBe('/artikel/judul-a');
    expect(localizeToInternal('/sign-in')).toBe('/masuk');
  });
});

describe('klasifikasi rute', () => {
  it('publik: beranda, halaman publik, dan form login', () => {
    expect(isPublicRoute('/')).toBe(true);
    expect(isPublicRoute('/id/produk')).toBe(true);
    expect(isPublicRoute('/en/products')).toBe(true);
    expect(isPublicRoute('/id/properti/rumah-x')).toBe(true);
    expect(isPublicRoute('/id/masuk')).toBe(true);
    expect(isPublicRoute('/en/sign-in')).toBe(true);
    expect(isPublicRoute('/id/autentikasi/pertukaran')).toBe(true);
  });

  it('login-only: studio, lab, dan form konten baru', () => {
    expect(isLoginOnlyRoute('/id/studio')).toBe(true);
    expect(isLoginOnlyRoute('/en/studio/batch')).toBe(true);
    expect(isLoginOnlyRoute('/id/lab')).toBe(true);
    expect(isLoginOnlyRoute('/id/lab/try')).toBe(true);
    expect(isLoginOnlyRoute('/id/konten/baru')).toBe(true);
    expect(getRouteClass('/id/studio')).toBe('login');
  });

  it('admin: /admin, review, dan riset (termasuk anak rute + pathname EN)', () => {
    expect(isAdminRoute('/id/admin')).toBe(true);
    expect(isAdminRoute('/id/admin/llm/logs')).toBe(true);
    expect(isAdminRoute('/en/admin/research/9a24c768')).toBe(true);
    expect(isAdminRoute('/id/admin/visual/angles/hero')).toBe(true);
    expect(isAdminRoute('/id/konten/review')).toBe(true);
    expect(isAdminRoute('/id/konten/review/2d2a5b31')).toBe(true);
    expect(isAdminRoute('/en/content/review/2d2a5b31')).toBe(true);
    expect(isAdminRoute('/id/konten/riset/abc')).toBe(true);
  });

  it('rute yang tidak terdaftar = wajib login (default aman, bukan publik)', () => {
    expect(getRouteClass('/id/dashboard-baru')).toBe('login');
    expect(isPublicRoute('/id/dashboard-baru')).toBe(false);
    expect(isAdminRoute('/id/dashboard-baru')).toBe(false);
  });

  it('prefix tidak bocor lintas rute (mis. /produk-lain bukan /products)', () => {
    expect(isPublicRoute('/id/produk-lain')).toBe(false);
    expect(isAdminRoute('/id/admin-lain')).toBe(false);
  });

  it('beranda bukan admin walau root', () => {
    expect(isAdminRoute('/')).toBe(false);
    expect(toInternalPath('/en')).toBe('/');
  });
});
