import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSearchProvider, type SearchResult } from './search';
import { buildDiscoveryPrompt } from './prompts';
import type { DiscoveryInput } from './prompts';
import { runLLMCompletion } from '@/lib/llm/completion';

export interface DiscoveryTopicRow {
  topic: string;
  category: string;
  why_now: string;
  audience_relevance: string;
  key_facts: string[];
  unique_angle: string;
  hooks: Array<{ type: string; text: string }>;
  recommended_format: string;
  recommended_platform: string[];
  potential_risk: string;
  sources: Array<{ title: string; publisher?: string; published_at?: string; url: string }>;
  score_breakdown: {
    freshness: number;
    local_relevance: number;
    practical_value: number;
    curiosity: number;
    emotional_resonance: number;
    credibility: number;
    conversation_potential: number;
    brand_relevance: number;
    penalty: number;
    final_score: number;
  };
  verification_status: 'pending' | 'verified' | 'unverified' | 'rejected';
}

interface DiscoveryLLMOutput {
  research_time?: string;
  target_audience?: string;
  search_summary?: {
    queries_used: string[];
    sources_reviewed?: number;
    candidates_found?: number;
    iterations_completed?: number;
  };
  recommended_topics: DiscoveryTopicRow[];
  rejected_topics?: Array<{ topic: string; reason: string }>;
}

function buildQueries(input: DiscoveryInput): string[] {
  const queries: string[] = [];
  const target = input.targetLocation || 'Indonesia';
  queries.push(`berita terbaru ${target} ${new Date().toISOString().slice(0, 10)}`);
  queries.push(`tren ${target} hari ini`);
  if (input.audienceInterests.length > 0) {
    queries.push(`${input.audienceInterests.slice(0, 2).join(' ')} viral ${target}`);
  }
  queries.push(`tips praktis ${input.platform} ${target}`);
  queries.push(`cerita inspiratif ${target}`);
  for (const cat of input.allowedCategories.slice(0, 2)) {
    queries.push(`${cat} terbaru ${target}`);
  }
  return queries;
}

function dedupResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    let host = '';
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      host = r.url;
    }
    const key = `${host}|${r.title.toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function chunkSourcesForLLM(results: SearchResult[]): SearchResult[] {
  return results.slice(0, 25);
}

export interface DiscoveryRunResult {
  topics: DiscoveryTopicRow[];
  searchSummary: DiscoveryLLMOutput['search_summary'];
}

export async function runDiscovery(
  supabase: SupabaseClient,
  sessionId: string,
  input: DiscoveryInput
): Promise<DiscoveryRunResult> {
  const provider = getSearchProvider();
  const queries = buildQueries(input);
  const timeRange =
    input.freshnessHours <= 24 ? 'day' : input.freshnessHours <= 168 ? 'week' : 'month';
  const settled = await Promise.allSettled(
    queries.map((q) =>
      provider.search(q, {
        maxResults: 8,
        topic: input.freshnessHours <= 48 ? 'news' : 'general',
        timeRange,
        includeRawContent: false
      })
    )
  );
  const rawResults: SearchResult[] = settled
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
  const deduped = dedupResults(rawResults);
  const chunked = chunkSourcesForLLM(deduped);

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'discovering',
    level: 'info',
    message: `search complete: ${rawResults.length} raw, ${deduped.length} deduped, sent ${chunked.length} to LLM`
  });

  const { system, user } = buildDiscoveryPrompt(input, chunked);
  const result = await runLLMCompletion(supabase, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.5
  });
  const parsed = parseDiscoveryOutput(result.output.text);
  if (parsed.topics.length > 0) {
    await supabase.from('content_research_topics').insert(
      parsed.topics.map((t, i) => ({
        session_id: sessionId,
        rank: i + 1,
        topic: t.topic,
        category: t.category,
        why_now: t.why_now,
        audience_relevance: t.audience_relevance,
        key_facts: t.key_facts,
        unique_angle: t.unique_angle,
        hooks: t.hooks,
        recommended_format: t.recommended_format,
        recommended_platform: t.recommended_platform,
        potential_risk: t.potential_risk,
        verification_status: t.verification_status,
        sources: t.sources,
        score_breakdown: t.score_breakdown,
        final_score: t.score_breakdown.final_score,
        status: 'pending'
      }))
    );
  }
  return { topics: parsed.topics, searchSummary: parsed.searchSummary };
}

function parseDiscoveryOutput(text: string): DiscoveryRunResult {
  const trimmed = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  let data: DiscoveryLLMOutput;
  try {
    data = JSON.parse(trimmed) as DiscoveryLLMOutput;
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Discovery LLM did not return valid JSON');
    data = JSON.parse(m[0]) as DiscoveryLLMOutput;
  }
  const topics = (data.recommended_topics ?? []).map((t) => ({
    ...t,
    verification_status: t.verification_status ?? ('pending' as const)
  }));
  return { topics, searchSummary: data.search_summary };
}
