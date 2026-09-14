import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { ArticleLocale, ArticleProduct, PublishedArticle } from './types';

/**
 * Akses publik (anon) ke artikel published — untuk halaman SSG/ISR.
 * Tanpa cookies agar halaman tetap statis.
 */
function anonClient() {
  if (!env.hasSupabase || !env.supabaseUrl || !env.supabaseAnonKey) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
}

const ARTICLE_SELECT =
  'id, slug, locale, title, excerpt, body_md, faq, cover_image_url, affiliate_url, product_id, published_at, updated_at';

type ArticleRow = Omit<PublishedArticle, 'locale' | 'faq'> & {
  locale: string;
  faq: { q: string; a: string }[] | null;
};

function toPublished(row: ArticleRow): PublishedArticle {
  return { ...row, locale: row.locale as ArticleLocale, faq: row.faq ?? [] };
}

export async function getPublishedArticles(locale: ArticleLocale, limit = 50): Promise<PublishedArticle[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('locale', locale)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as ArticleRow[]).map(toPublished);
}

export async function getPublishedArticleBySlug(
  locale: ArticleLocale,
  slug: string
): Promise<PublishedArticle | null> {
  const supabase = anonClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('locale', locale)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return data ? toPublished(data as ArticleRow) : null;
}

/** Semua slug published (sitemap + generateStaticParams). Gagal → []. */
export async function getAllPublishedSlugs(): Promise<{ locale: ArticleLocale; slug: string; published_at: string | null }[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('articles')
    .select('locale, slug, published_at')
    .eq('status', 'published')
    .limit(500);
  return ((data ?? []) as { locale: string; slug: string; published_at: string | null }[]).map((r) => ({
    locale: r.locale as ArticleLocale,
    slug: r.slug,
    published_at: r.published_at
  }));
}

export async function getArticleProduct(productId: string | null): Promise<ArticleProduct | null> {
  if (!productId) return null;
  const supabase = anonClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('affiliate_products')
    .select('name_id, name_en, url, image')
    .eq('id', productId)
    .eq('is_active', true)
    .maybeSingle();
  const p = data as { name_id: string; name_en: string; url: string; image: string | null } | null;
  if (!p) return null;
  return { name: p.name_id, url: p.url, image: p.image };
}
