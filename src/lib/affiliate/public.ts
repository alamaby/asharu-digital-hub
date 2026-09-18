import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { AffiliateProduct } from '@/data/schemas';
import { productCategorySchema } from '@/data/schemas';

/**
 * Akses publik (anon) ke katalog afiliasi — untuk halaman SSG/ISR.
 * Cookie-less agar halaman tetap statis (bisa di-cache Vercel / ISR).
 *
 * M3: menggantikan impor statis `src/data/affiliate-products.ts`.
 * Pola disalin dari `src/lib/articles/public.ts` (anonClient, persistSession:false).
 */
function anonClient() {
  if (!env.hasSupabase || !env.supabaseUrl || !env.supabasePublishableKey) {
    return null;
  }
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false }
  });
}

const PRODUCT_SELECT =
  'friendly_code, external_id, name_id, name_en, category, merchant, url, image, is_featured, featured_override, featured_rank, created_at';

type AffiliateRow = {
  friendly_code: string;
  external_id: string;
  name_id: string;
  name_en: string;
  category: string;
  merchant: string;
  url: string;
  image: string;
  is_featured: boolean;
  featured_override: boolean | null;
  featured_rank: number;
  created_at: string;
};

/** Mapper DB → AffiliateProduct. Di pindahkan ke DB-only. */
export function toAffiliateProduct(row: AffiliateRow): AffiliateProduct {
  const category = productCategorySchema.safeParse(row.category);
  return {
    id: row.friendly_code,
    name: { id: row.name_id, en: row.name_en },
    category: category.success ? category.data : ('others' as const),
    description: { id: row.name_id, en: row.name_en },
    merchant: row.merchant,
    url: row.url,
    image: row.image,
    /**
     * `featured` = true bila produk ini "dipatok" atau mengikuti default scraper.
     * Kolom generated `featured_rank` mengurungkan hasil: rank 0 = admin-pinned,
     * 1 = scraper-default, 2 = excluded-by-admin atau non-featured. Baris rank
     * <= 1 termasuk dalam kategori featured; baris rank 2 dikeluarkan.
     *
     * Catatan: `featured` ini dipakai untuk badge/JSON-LD dan tidak dipakai untuk
     * pengurutan publik (pengurutan pakai featured_rank di DB).
     */
    featured: (row.featured_override ?? row.is_featured) === true || row.featured_rank <= 1
  };
}

/**
 * Katalog publik `/products`: produk ranked dulu (admin-pin > scraper-default > sisa),
 * lalu newest. Tanpa override, order IDENTIK dengan pola lama (`is_featured DESC,
 * created_at DESC`) karena `featured_rank` = 1 untuk row is_featured=true dan 2 untuk
 * yang lain — sehingga ranking 0/1 berada di depan secara natural.
 *
 * RCA 2026-09-16: halaman `/id/produk` tampak "masih lama" karena sebelumnya
 * diurut `friendly_code ASC` (ASH-001...), sehingga produk baru (ASH-255)
 * terkubur di halaman ke-30 sementara `ProductBrowser` hanya merender 8 item
 * pertama. Tie-breaker memakai `created_at`, bukan `friendly_code`, agar urutan
 * tetap benar bila kode melewati 3 digit (ASH-1000+).
 */
export async function getActiveProducts(): Promise<AffiliateProduct[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('affiliate_products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .order('featured_rank', { ascending: true })
    .order('created_at', { ascending: false });
  return ((data ?? []) as AffiliateRow[]).map(toAffiliateProduct);
}

/**
 * Carousel beranda: ambil top-6 produk "featured" menurut ranking kurasi.
 * Filter `featured_override !== false` dilakukan di JS karena mock builder
 * minimal (tanpa `.or()`) dan PostgREST tidak bisa `featured_override IS NOT FALSE`
 * tanpa builder helper tambahan — aman karena 12 baris (active × curated).
 *
 * Tanpa override aktif, hasil IDENTIK query lama: limit 6, order `created_at DESC`.
 */
export async function getFeaturedProductsDB(max = 6): Promise<AffiliateProduct[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  // Ambilkah max+6 agar cukup ruang untuk filter JS (aman untuk ~240 row).
  const buffer = max + 6;
  const { data } = await supabase
    .from('affiliate_products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .order('featured_rank', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(buffer);
  const rows = (data ?? []) as AffiliateRow[];
  const filtered = rows.filter((r) => r.featured_override !== false);
  return filtered.slice(0, max).map(toAffiliateProduct);
}
