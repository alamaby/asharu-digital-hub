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
  'friendly_code, external_id, name_id, name_en, category, merchant, url, image, is_featured, created_at';

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
    featured: row.is_featured
  };
}

/**
 * Katalog publik `/products`: produk `featured` dulu, lalu yang terbaru.
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
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });
  return ((data ?? []) as AffiliateRow[]).map(toAffiliateProduct);
}

export async function getFeaturedProductsDB(max = 6): Promise<AffiliateProduct[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('affiliate_products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(max);
  return ((data ?? []) as AffiliateRow[]).map(toAffiliateProduct);
}
