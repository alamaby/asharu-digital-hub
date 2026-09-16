import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { localizedPathname } from '@/lib/seo/paths';

/**
 * Purge cache ISR untuk halaman publik yang menampilkan katalog afiliasi.
 *
 * Kedua halaman publik memakai `revalidate = 3600`, tetapi penulis katalog
 * (scraper harian di GitHub Actions) menulis LANGSUNG ke Postgres — tidak lewat
 * Server Action — sehingga tidak ada `revalidatePath` yang terpanggil. Akibatnya
 * perubahan (produk baru, pergantian `is_featured`) baru tampil hingga 1 jam
 * kemudian. Endpoint `/api/revalidate/products` memanggil helper ini agar
 * scraper bisa memicu purge segera setelah sync.
 *
 * next-intl me-rewrite URL publik ke route internal (`/id/produk` →
 * `/[locale]/products`). Kunci cache Next bisa mengacu ke salah satu bentuk,
 * jadi keduanya dipurge — murah dan idempoten.
 */
export function revalidateAffiliateCatalog(): string[] {
  const paths = new Set<string>();

  for (const locale of routing.locales) {
    // Bentuk URL publik (yang di-crawl & di-cache Vercel).
    paths.add(localizedPathname('/', locale));
    paths.add(localizedPathname('/products', locale));
    // Bentuk route internal setelah rewrite middleware.
    paths.add(`/${locale}/products`);
  }

  const result = [...paths];
  for (const path of result) {
    revalidatePath(path);
  }

  return result;
}
