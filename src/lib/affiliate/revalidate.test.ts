import { describe, expect, it, vi, beforeEach } from 'vitest';

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath }));

import { revalidateAffiliateCatalog } from './revalidate';

beforeEach(() => {
  revalidatePath.mockClear();
});

describe('revalidateAffiliateCatalog', () => {
  it('purges home + product pages for every locale, in both public and internal form', () => {
    const paths = revalidateAffiliateCatalog();

    expect(paths).toEqual([
      '/id',
      '/id/produk',
      '/id/products',
      '/en',
      '/en/products'
    ]);
    expect(revalidatePath.mock.calls.map(([p]) => p)).toEqual(paths);
  });

  it('revalidates the internal English route as well as the localized one', () => {
    revalidateAffiliateCatalog();

    expect(revalidatePath).toHaveBeenCalledWith('/en/products');
    expect(revalidatePath).toHaveBeenCalledWith('/en');
  });

  it('never duplicates a path', () => {
    const paths = revalidateAffiliateCatalog();
    expect(new Set(paths).size).toBe(paths.length);
  });
});
