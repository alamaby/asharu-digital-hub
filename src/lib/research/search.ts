/**
 * Search provider abstraction for the research pipeline.
 * Currently only Tavily is wired; the interface allows swapping in Serper /
 * Brave / Exa later without touching the stage handlers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SearchResult {
  title: string;
  url: string;
  /** Short snippet from the page (Tavily "content" field). */
  content: string;
  /** Provider relevance score (0–1). */
  score: number;
  /** ISO date string when the page was published, if available. */
  publishedDate?: string;
}

export interface SearchOptions {
  /** Maximum number of results to return. */
  maxResults?: number;
  /** Topic for search recency bias; Tavily uses it to prefer recent content. */
  topic?: 'general' | 'news';
  /** Time range filter (Tavily: 'day' | 'week' | 'month' | 'year'). */
  timeRange?: 'day' | 'week' | 'month' | 'year';
  /** Whether to include the full page content (more tokens, better for verification). */
  includeRawContent?: boolean;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  /** Fetch full page content for user-pasted URLs (Tavily /extract). */
  extract(urls: string[], options?: { query?: string; maxChars?: number }): Promise<SearchResult[]>;
}

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string;
    score?: number;
    published_date?: string;
  }>;
  answer?: string;
}

interface TavilyExtractResponse {
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
    raw_content?: string;
  }>;
  failed_results?: Array<{ url?: string; error?: string }>;
}

export class TavilyProvider implements SearchProvider {
  readonly name = 'tavily';
  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { maxResults = 8, topic = 'general', timeRange, includeRawContent = false } = options;
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      query,
      max_results: maxResults,
      topic,
      include_answer: false,
      include_raw_content: includeRawContent,
      search_depth: 'basic'
    };
    if (timeRange) body.days = daysFromRange(timeRange);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      throw new Error(`Tavily search network error: ${(e as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      throw new Error(`Tavily search failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const data = (await res.json()) as TavilyResponse;
    return (data.results ?? []).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: r.content ?? r.raw_content ?? '',
      score: typeof r.score === 'number' ? r.score : 0,
      publishedDate: r.published_date
    }));
  }

  async extract(urls: string[], options: { query?: string; maxChars?: number } = {}): Promise<SearchResult[]> {
    if (urls.length === 0) return [];
    const { query, maxChars = 4000 } = options;
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      urls: urls.slice(0, 3),
      extract_depth: 'basic',
      format: 'text',
      include_images: false
    };
    if (query) body.query = query;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      throw new Error(`Tavily extract network error: ${(e as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      throw new Error(`Tavily extract failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const data = (await res.json()) as TavilyExtractResponse;
    return (data.results ?? []).map((r) => ({
      title: r.title ?? r.url ?? '',
      url: r.url ?? '',
      content: (r.content ?? r.raw_content ?? '').slice(0, maxChars),
      score: 1
    }));
  }
}

function daysFromRange(range: 'day' | 'week' | 'month' | 'year'): number {
  switch (range) {
    case 'day':
      return 1;
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'year':
      return 365;
  }
}

let cached: SearchProvider | null = null;
let cacheKey: string | null = null;

/**
 * Resolve the Tavily API key and return the configured search provider.
 *
 * Key resolution order:
 *   1. Supabase Vault secret `tavily_api_key` (preferred — supports rotation
 *      via Dashboard, consistent with the LLM-key pattern). Read via the
 *      service_role-only `vault_decrypt_secret_by_name` RPC.
 *   2. `process.env.TAVILY_API_KEY` (local dev / fallback).
 *
 * Pass the service-role `supabase` client from the caller so we don't spin up
 * a second client here. Throws if neither source yields a key.
 */
export async function getSearchProvider(supabase?: SupabaseClient): Promise<SearchProvider> {
  let key = process.env.TAVILY_API_KEY;
  if (!key && supabase) {
    const { data } = await supabase.rpc('vault_decrypt_secret_by_name', {
      p_name: 'tavily_api_key'
    });
    if (typeof data === 'string' && data.length > 0) key = data;
  }
  if (!key) {
    throw new Error(
      'Tavily API key not configured (Vault `tavily_api_key` or env TAVILY_API_KEY)'
    );
  }
  if (cached && cacheKey === key) return cached;
  cached = new TavilyProvider(key);
  cacheKey = key;
  return cached;
}
