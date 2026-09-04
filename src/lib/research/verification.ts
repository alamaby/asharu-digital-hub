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

export async function runVerification(supabase: SupabaseClient, sessionId: string): Promise<void> {
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
  const result = await runLLMCompletion(supabase, {
    requestId: null,
    sessionId,
    stage: 'verifying',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2
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
      .eq('id', v.topic_id);
  }
  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'verifying',
    level: 'info',
    message: `verified ${parsed.length} topic(s)`
  });
}

function parseVerificationOutput(text: string, candidates: TopicCandidate[]): VerificationOutputItem[] {
  const trimmed = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  let data: VerificationLLMOutput;
  try {
    data = JSON.parse(trimmed) as VerificationLLMOutput;
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      data = JSON.parse(m[0]) as VerificationLLMOutput;
    } catch {
      return [];
    }
  }
  const results = data.results ?? [];
  // If LLM didn't include topic_id, map by index
  return results.map((r, i) => ({
    ...r,
    topic_id: r.topic_id ?? candidates[i]?.id
  }));
}
