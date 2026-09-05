import type { SupabaseClient } from '@supabase/supabase-js';

export interface AffiliateProductRow {
  id: string;
  friendly_code: string;
  external_id: string;
  name_id: string;
  name_en: string;
  category: string;
  merchant: string;
  url: string;
  image: string;
}

export interface AffiliateMatchSignals {
  category_match: boolean;
  keyword_overlap: number;
  scored_from_pool_size: number;
  no_recent_products?: boolean;
  fallback_random?: boolean;
  original_best_score?: number;
  /** Mekanisme dua: produk pilihan user, bukan hasil scoring. */
  fixed_pick?: boolean;
}

export interface SelectedAffiliate {
  product: AffiliateProductRow;
  matchScore: number;
  signals: AffiliateMatchSignals;
}

export interface TopicForMatching {
  topic: string;
  category?: string | null;
  unique_angle?: string | null;
  key_facts?: string[];
  hooks?: Array<{ type: string; text: string }>;
}

const CATEGORY_MATCH_BONUS = 50;
const CATEGORY_PARTIAL_BONUS = 25;
const KEYWORD_OVERLAP_BONUS = 3;
const KEYWORD_MIN_LENGTH = 4;
const POOL_SIZE = 50;
export const RANDOM_FALLBACK_POOL_SIZE = 20;
const RELEVANCE_HIGH = 50;
const RELEVANCE_MEDIUM = 10;
const MIN_ACCEPTABLE_SCORE = 6;

/**
 * Select the most relevant active affiliate product for a topic, from the
 * most recently added POOL_SIZE products. Returns null if the pool is empty
 * or no product reaches MIN_ACCEPTABLE_SCORE. Strict scoring only.
 */
export async function selectAffiliateProduct(
  supabase: SupabaseClient,
  topic: TopicForMatching
): Promise<SelectedAffiliate | null> {
  const products = await fetchActivePool(supabase);
  if (products.length === 0) return null;
  return scoreBestProduct(topic, products);
}

export async function selectAffiliateWithRandomFallback(
  supabase: SupabaseClient,
  topic: TopicForMatching
): Promise<SelectedAffiliate | null> {
  const products = await fetchActivePool(supabase);
  if (products.length === 0) return null;
  const strict = scoreBestProduct(topic, products);
  if (strict) return strict;
  // Fallback: random dari 20 terbaru (indeks 0..19 pool yang sudah ORDER BY created_at DESC)
  const pool20 = products.slice(0, RANDOM_FALLBACK_POOL_SIZE);
  const source = pool20.length > 0 ? pool20 : products;
  const idx = Math.floor(Math.random() * source.length);
  const product = source[idx]!;
  const bestScore = computeTopScore(topic, products);
  return {
    product,
    matchScore: 0,
    signals: {
      category_match: false,
      keyword_overlap: 0,
      scored_from_pool_size: products.length,
      fallback_random: true,
      original_best_score: Math.max(0, bestScore)
    }
  };
}

/**
 * Batch preview affiliate matches for multiple topics in a single pool fetch.
 * Returns a map of topic id -> { matched: boolean; bestScore: number; band }.
 * Used at awaiting_selection to warn admin BEFORE shortlisting which topics
 * will generate a draft with no affiliate match, so they can add relevant
 * products (e.g. scrape a new category) or pick more matchable topics.
 */
export async function previewAffiliateMatches(
  supabase: SupabaseClient,
  topics: Array<{ id: string } & TopicForMatching>
): Promise<Map<string, { matched: boolean; bestScore: number; band: 'high' | 'medium' | 'low' | 'none' }>> {
  const products = await fetchActivePool(supabase);
  const out = new Map<string, { matched: boolean; bestScore: number; band: 'high' | 'medium' | 'low' | 'none' }>();
  for (const tp of topics) {
    const result = scoreBestProduct(tp, products);
    if (result) {
      out.set(tp.id, { matched: true, bestScore: result.matchScore, band: relevanceBand(result.matchScore) });
    } else {
      const bestScore = products.length === 0 ? -1 : computeTopScore(tp, products);
      out.set(tp.id, { matched: false, bestScore: Math.max(0, bestScore), band: 'none' });
    }
  }
  return out;
}

async function fetchActivePool(supabase: SupabaseClient): Promise<AffiliateProductRow[]> {
  const { data: pool, error } = await supabase
    .from('affiliate_products')
    .select('id, friendly_code, external_id, name_id, name_en, category, merchant, url, image')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(POOL_SIZE);
  if (error) throw new Error(`affiliate pool query: ${error.message}`);
  return (pool ?? []) as AffiliateProductRow[];
}

function computeTopScore(topic: TopicForMatching, products: AffiliateProductRow[]): number {
  const topicCategory = (topic.category ?? '').toLowerCase().trim();
  const topicText = buildTopicText(topic).toLowerCase();
  const uniqueKeywords = Array.from(new Set(topicText.split(/\W+/).filter((w) => w.length >= KEYWORD_MIN_LENGTH)));
  let top = -1;
  for (const product of products) {
    const productCategory = (product.category ?? '').toLowerCase().trim();
    let score = 0;
    if (topicCategory) {
      if (productCategory === topicCategory) score += CATEGORY_MATCH_BONUS;
      else if (productCategory && productCategory.includes(topicCategory)) score += CATEGORY_PARTIAL_BONUS;
    }
    const productText = `${product.name_id} ${product.name_en} ${product.category} ${product.merchant}`.toLowerCase();
    score += uniqueKeywords.filter((w) => productText.includes(w)).length * KEYWORD_OVERLAP_BONUS;
    if (score > top) top = score;
  }
  return top;
}

function scoreBestProduct(topic: TopicForMatching, products: AffiliateProductRow[]): SelectedAffiliate | null {
  if (products.length === 0) return null;
  const topicCategory = (topic.category ?? '').toLowerCase().trim();
  const topicText = buildTopicText(topic).toLowerCase();
  const topicKeywords = topicText
    .split(/\W+/)
    .filter((w) => w.length >= KEYWORD_MIN_LENGTH);
  const uniqueKeywords = Array.from(new Set(topicKeywords));

  let bestScore = -1;
  let best: AffiliateProductRow | null = null;
  let bestSignals: AffiliateMatchSignals | null = null;
  for (const product of products) {
    const productCategory = (product.category ?? '').toLowerCase().trim();
    let score = 0;
    let categoryMatch = false;
    if (topicCategory) {
      if (productCategory === topicCategory) {
        score += CATEGORY_MATCH_BONUS;
        categoryMatch = true;
      } else if (productCategory && productCategory.includes(topicCategory)) {
        score += CATEGORY_PARTIAL_BONUS;
        categoryMatch = true;
      }
    }
    const productText = `${product.name_id} ${product.name_en} ${product.category} ${product.merchant}`.toLowerCase();
    const overlap = uniqueKeywords.filter((w) => productText.includes(w)).length;
    score += overlap * KEYWORD_OVERLAP_BONUS;
    if (score > bestScore) {
      bestScore = score;
      best = product;
      bestSignals = {
        category_match: categoryMatch,
        keyword_overlap: overlap,
        scored_from_pool_size: products.length
      };
    }
  }
  if (!best || !bestSignals || bestScore < MIN_ACCEPTABLE_SCORE) {
    return null;
  }
  return { product: best, matchScore: bestScore, signals: bestSignals };
}

export function relevanceBand(score: number | null): 'high' | 'medium' | 'low' | 'none' {
  if (score === null || score === undefined) return 'none';
  if (score >= RELEVANCE_HIGH) return 'high';
  if (score >= RELEVANCE_MEDIUM) return 'medium';
  return 'low';
}

function buildTopicText(topic: TopicForMatching): string {
  const parts: string[] = [topic.topic];
  if (topic.unique_angle) parts.push(topic.unique_angle);
  if (topic.key_facts && topic.key_facts.length > 0) parts.push(...topic.key_facts);
  if (topic.hooks && topic.hooks.length > 0) parts.push(...topic.hooks.map((h) => h.text));
  return parts.join(' ');
}
