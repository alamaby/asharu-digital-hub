/**
 * Search provider abstraction for the research pipeline.
 * Currently only Tavily is wired; the interface allows swapping in Serper /
 * Brave / Exa later without touching the stage handlers.
 */

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
 * Returns the configured search provider (singleton per process).
 * Reads TAVILY_API_KEY from env. If absent, throws — callers should check
 * `env.tavilyApiKey` before scheduling a research session.
 */
export function getSearchProvider(): SearchProvider {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error('TAVILY_API_KEY is not configured');
  }
  if (cached && cacheKey === key) return cached;
  cached = new TavilyProvider(key);
  cacheKey = key;
  return cached;
}
