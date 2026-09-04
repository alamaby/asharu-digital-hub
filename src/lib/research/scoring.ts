import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildScoringPrompt, DEFAULT_SCORING_WEIGHTS } from './prompts';
import { runLLMCompletion } from '@/lib/llm/completion';

interface ScoreBreakdown {
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
}

interface ScoringLLMOutput {
  results: Array<{
    topic_id?: string;
    score_breakdown: ScoreBreakdown;
  }>;
}

function computeFinalScore(b: ScoreBreakdown): number {
  const w = DEFAULT_SCORING_WEIGHTS;
  const weighted =
    b.freshness * w.freshness +
    b.local_relevance * w.localRelevance +
    b.practical_value * w.practicalValue +
    b.curiosity * w.curiosity +
    b.emotional_resonance * w.emotionalResonance +
    b.credibility * w.credibility +
    b.conversation_potential * w.conversationPotential +
    b.brand_relevance * w.brandRelevance;
  const adjusted = weighted - (b.penalty ?? 0);
  return Math.max(0, Math.min(10, Number(adjusted.toFixed(2))));
}

interface TopicForScoring {
  id: string;
  topic: string;
  category: string | null;
  why_now: string | null;
  audience_relevance: string | null;
  key_facts: unknown;
  unique_angle: string | null;
  hooks: unknown;
}

export async function runScoring(
  supabase: SupabaseClient,
  sessionId: string,
  pinnedModelId?: string | null
): Promise<void> {
  const { data: topics, error } = await supabase
    .from('content_research_topics')
    .select('id, topic, category, why_now, audience_relevance, key_facts, unique_angle, hooks')
    .eq('session_id', sessionId)
    .neq('verification_status', 'rejected');
  if (error) throw new Error(`scoring fetch: ${error.message}`);
  if (!topics || topics.length === 0) return;

  const { system, user } = buildScoringPrompt({
    topic: serializeTopics(topics as TopicForScoring[]),
    weights: DEFAULT_SCORING_WEIGHTS
  });
  let scoringModel: { providerId: string | null; modelUuid: string | null } = { providerId: null, modelUuid: null };
  if (pinnedModelId) {
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', pinnedModelId).eq('is_active', true).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (mr) scoringModel = { providerId: mr.provider_id, modelUuid: mr.id };
  } else {
    try {
      const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
      scoringModel = await resolveStageModel('scoring', null);
    } catch { void 0; }
  }
  const result = await runLLMCompletion(supabase, {
    requestId: null,
    sessionId,
    stage: 'scoring',
    providerId: scoringModel.providerId,
    modelUuid: scoringModel.modelUuid,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2
  });
  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'scoring',
    level: 'info',
    message: `scoring LLM raw (first 2000 chars): ${result.output.text.slice(0, 2000)}`
  });
  const parsed = parseScoringOutput(result.output.text, topics as TopicForScoring[]);
  for (const item of parsed) {
    if (!item.topic_id) continue;
    const final = computeFinalScore(item.score_breakdown);
    await supabase
      .from('content_research_topics')
      .update({
        score_breakdown: { ...item.score_breakdown, final_score: final },
        final_score: final
      })
      .eq('id', item.topic_id);
  }
  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'scoring',
    level: 'info',
    message: `scored ${parsed.length} topic(s)`
  });
}

function serializeTopics(topics: TopicForScoring[]): {
  topic: string;
  category: string | null;
  whyNow: string | null;
  audienceRelevance: string | null;
  keyFacts: string[];
  uniqueAngle: string | null;
  hooks: Array<{ type: string; text: string }>;
} {
  // Pass topics as a JSON array (in the `topic` field) so small models can
  // clearly see the per-topic fields they need to score. Other fields are
  // blank placeholders (unused by the scoring prompt).
  return {
    topic: JSON.stringify(
      topics.map((t) => ({
        id: t.id,
        topic: t.topic,
        category: t.category ?? null,
        why_now: t.why_now ?? null,
        audience_relevance: t.audience_relevance ?? null,
        key_facts: Array.isArray(t.key_facts) ? t.key_facts : [],
        unique_angle: t.unique_angle ?? null,
        hooks: Array.isArray(t.hooks) ? t.hooks : []
      })),
      null,
      2
    ),
    category: null,
    whyNow: null,
    audienceRelevance: null,
    keyFacts: [],
    uniqueAngle: null,
    hooks: []
  };
}

function parseScoringOutput(text: string, candidates: TopicForScoring[]): ScoringLLMOutput['results'] {
  const trimmed = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  let data: ScoringLLMOutput;
  try {
    data = JSON.parse(trimmed) as ScoringLLMOutput;
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      data = JSON.parse(m[0]) as ScoringLLMOutput;
    } catch {
      return [];
    }
  }
  const results = data.results ?? [];
  return results.map((r, i) => ({
    ...r,
    topic_id: r.topic_id ?? candidates[i]?.id
  }));
}
