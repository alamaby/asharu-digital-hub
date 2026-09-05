import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildVerificationPrompt } from './prompts';
import { runLLMCompletion } from '@/lib/llm/completion';

interface VerificationOutputItem {
  topic_id?: string;
  topic?: string;
  verification_status: 'verified' | 'unverified' | 'rejected';
  reason?: string;
}

interface VerificationLLMOutput {
  results: VerificationOutputItem[];
}

interface TopicCandidate {
  id: string;
  topic: string;
  category?: string | null;
  sources: Array<{ title: string; url: string; published_at?: string; publisher?: string }>;
}

export async function runVerification(supabase: SupabaseClient, sessionId: string, pinnedModelId?: string | null): Promise<void> {
  const { data: topics, error } = await supabase
    .from('content_research_topics')
    .select('id, topic, category, sources')
    .eq('session_id', sessionId)
    .eq('verification_status', 'pending');
  if (error) throw new Error(`verification fetch: ${error.message}`);
  if (!topics || topics.length === 0) return;
  const candidates: TopicCandidate[] = (topics as TopicCandidate[]).map((t) => ({
    id: t.id,
    topic: t.topic,
    category: t.category,
    sources: Array.isArray(t.sources) ? t.sources : []
  }));
  if (candidates.length === 0) return;

  const { system, user } = buildVerificationPrompt({ topic: { topic: 'batch' }, candidates });
  let verifyModel: { providerId: string | null; modelUuid: string | null } = { providerId: null, modelUuid: null };
  if (pinnedModelId) {
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', pinnedModelId).eq('is_active', true).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (mr) verifyModel = { providerId: mr.provider_id, modelUuid: mr.id };
  } else {
    try {
      const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
      verifyModel = await resolveStageModel('verifying', null);
    } catch { void 0; }
  }
  const result = await runLLMCompletion(supabase, {
    requestId: null,
    sessionId,
    stage: 'verifying',
    providerId: verifyModel.providerId,
    modelUuid: verifyModel.modelUuid,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2,
    maxTokens: 2000
  });
  const parsed = parseVerificationOutput(result.output.text, candidates);
  if (parsed.length === 0) {
    // If the LLM returned nothing parseable, leave topics as 'unverified'
    // rather than silently skipping (scoring will still process them).
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'verifying',
      level: 'warn',
      message: 'verification LLM returned 0 results; leaving topics as unverified'
    });
    return;
  }
  for (const v of parsed) {
    if (!v.topic_id) continue;
    // Never accept 'rejected' from the LLM — topics without sources can't be
    // fact-checked, so default to 'unverified'. Admin can reject manually
    // via the UI. Only accept 'verified' from the LLM.
    const status = v.verification_status === 'verified' ? 'verified' : 'unverified';
    await supabase
      .from('content_research_topics')
      .update({ verification_status: status })
      .eq('id', v.topic_id)
      .eq('session_id', sessionId);
  }
  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'verifying',
    level: 'info',
    message: `verified ${parsed.length} topic(s)`
  });
}

function parseVerificationOutput(text: string, candidates: TopicCandidate[]): VerificationOutputItem[] {
  const trimmed = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes('```') ? '' : m))
    .replace(/```[\s\S]*$/i, '')
    .trim();
  if (!trimmed) return [];
  let data: VerificationLLMOutput;
  try {
    data = JSON.parse(trimmed) as VerificationLLMOutput;
  } catch {
    const extracted = extractLargestJson(trimmed);
    if (!extracted) return [];
    try {
      data = JSON.parse(extracted) as VerificationLLMOutput;
    } catch {
      return [];
    }
  }
  const results = data.results ?? [];
  const validIds = new Set(candidates.map((c) => c.id));
  // If LLM didn't include topic_id, map by index
  return results
    .map((r, i) => ({
      ...r,
      topic_id: r.topic_id ?? candidates[i]?.id
    }))
    .filter((r) => r.topic_id && validIds.has(r.topic_id));
}

/** Ambil blok JSON terbesar (brace-matched) agar output terpotong tidak merusak parse. */
function extractLargestJson(s: string): string | null {
  let best: string | null = null;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const cand = s.slice(start, i + 1);
        if (!best || cand.length > best.length) best = cand;
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return best;
}
