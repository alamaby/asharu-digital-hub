import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { buildThreadPrompt, countPlaceholdersInThread } from '@/lib/llm/prompt';
import type { ThreadGeneration } from '@/lib/llm/types';
import { runLLMCompletion } from '@/lib/llm/completion';
import { selectAffiliateProduct, type SelectedAffiliate } from './affiliate';

const threadSchema = z.object({
  main: z.object({ id: z.string().min(1), en: z.string().min(1) }),
  replies: z
    .array(z.object({ id: z.string().min(1), en: z.string().min(1) }))
    .max(5)
});

interface DevelopmentInput {
  topic: {
    id: string;
    topic: string;
    category: string | null;
    key_facts: unknown;
    hooks: unknown;
    unique_angle: string | null;
  };
  platform: { slug: string; maxChars: number | null };
  tone: string;
  audience: string;
  ctaStyle: string;
  purpose: string;
  language: string;
  constraints?: string | null;
  keywords?: string | null;
}

export async function runDevelopment(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { data: session, error: sessionError } = await supabase
    .from('content_research_sessions')
    .select(
      'id, platform_slug, tone, account_goal, audience_age, audience_interests, target_location'
    )
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) throw new Error('session not found');
  const sess = session as {
    id: string;
    platform_slug: string | null;
    tone: string | null;
    account_goal: string | null;
    audience_age: string | null;
    audience_interests: string[] | null;
    target_location: string | null;
  };

  const { data: topics, error: topicError } = await supabase
    .from('content_research_topics')
    .select('id, topic, category, key_facts, hooks, unique_angle')
    .eq('session_id', sessionId)
    .eq('status', 'shortlisted')
    .order('rank', { ascending: true })
    .limit(1);
  if (topicError) throw new Error('topic fetch failed');
  if (!topics || topics.length === 0) {
    await supabase
      .from('content_research_sessions')
      .update({ status: 'failed', error_message: 'no shortlisted topics' })
      .eq('id', sessionId);
    return;
  }
  const topic = topics[0] as {
    id: string;
    topic: string;
    category: string | null;
    key_facts: unknown;
    hooks: unknown;
    unique_angle: string | null;
  };

  // Platform info
  const platformSlug = sess.platform_slug ?? 'threads';
  const { data: platformRow } = await supabase
    .from('platforms')
    .select('max_chars')
    .eq('slug', platformSlug)
    .maybeSingle();
  const platform = {
    slug: platformSlug,
    maxChars: (platformRow as { max_chars: number | null } | null)?.max_chars ?? null
  };

  // Build placeholder topic text (the LLM drafts around the topic)
  const input: DevelopmentInput = {
    topic,
    platform,
    tone: sess.tone ?? 'casual',
    audience: sess.audience_age ?? 'umum',
    ctaStyle: 'soft_sell',
    purpose: sess.account_goal ?? 'membagikan informasi bermanfaat',
    language: 'both'
  };

  // We need a real product for the LLM prompt. Select the affiliate first so
  // the prompt has a concrete product to weave in.
  const affiliate = await selectAffiliateProduct(supabase, {
    topic: topic.topic,
    category: topic.category,
    unique_angle: topic.unique_angle,
    key_facts: Array.isArray(topic.key_facts) ? (topic.key_facts as string[]) : undefined,
    hooks: Array.isArray(topic.hooks)
      ? (topic.hooks as Array<{ type: string; text: string }>)
      : undefined
  });

  if (!affiliate) {
    // No recent products — create draft without injection + flag.
    await generateAndInsertDraft(supabase, sessionId, topic.id, input, null);
    return;
  }

  // Call LLM with product inlined
  const { system, user } = buildThreadPrompt(
    {
      topic: input.topic.topic,
      platform: { slug: input.platform.slug, maxChars: input.platform.maxChars },
      tone: input.tone,
      audience: input.audience,
      ctaStyle: input.ctaStyle,
      purpose: input.purpose,
      language: input.language
    },
    {
      friendlyCode: affiliate.product.friendly_code,
      name: affiliate.product.name_id,
      url: affiliate.product.url,
      category: affiliate.product.category
    }
  );
  const llmResult = await runLLMCompletion(supabase, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.7
  });
  const parsed = parseThread(llmResult.output.text);
  if (!parsed) {
    throw new Error('thread parse failed');
  }
  // Inject product URL into placeholders
  const replaced = replacePlaceholders(parsed, affiliate.product.url);

  await supabase.from('content_drafts').insert({
    request_id: sessionId,
    provider_id: null,
    model_id: llmResult.model,
    research_topic_id: topic.id,
    generated_thread: replaced as unknown as Record<string, unknown>,
    affiliate_injections: [
      {
        friendly_code: affiliate.product.friendly_code,
        url: affiliate.product.url,
        post_index: 0,
        match_score: affiliate.matchScore,
        match_signals: affiliate.signals
      }
    ] as unknown as Record<string, unknown>[],
    status: 'needs_review',
    llm_meta: {
      provider: llmResult.providerSlug,
      model: llmResult.model,
      latency_ms: llmResult.latencyMs,
      key_hash: llmResult.keyHash
    },
    affiliate_match_score: affiliate.matchScore,
    affiliate_match_signals: affiliate.signals as unknown as Record<string, unknown>
  });
  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'developing',
    level: 'info',
    message: `draft generated with affiliate ${affiliate.product.friendly_code} (match ${affiliate.matchScore})`
  });
}

async function generateAndInsertDraft(
  supabase: SupabaseClient,
  sessionId: string,
  topicId: string,
  input: DevelopmentInput,
  affiliate: SelectedAffiliate | null
): Promise<void> {
  const { system, user } = buildThreadPrompt(
    {
      topic: input.topic.topic,
      platform: { slug: input.platform.slug, maxChars: input.platform.maxChars },
      tone: input.tone,
      audience: input.audience,
      ctaStyle: input.ctaStyle,
      purpose: input.purpose,
      language: input.language
    },
    {
      friendlyCode: 'NONE',
      name: 'tanpa afiliasi',
      url: 'https://example.com',
      category: '-'
    }
  );
  const llmResult = await runLLMCompletion(supabase, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.7
  });
  const parsed = parseThread(llmResult.output.text);
  if (!parsed) {
    throw new Error('thread parse failed (no-affiliate path)');
  }
  const injection = affiliate
    ? ([
        {
          friendly_code: affiliate.product.friendly_code,
          url: affiliate.product.url,
          post_index: 0,
          match_score: affiliate.matchScore,
          match_signals: affiliate.signals
        }
      ] as unknown as Record<string, unknown>[])
    : ([] as unknown as Record<string, unknown>[]);
  await supabase.from('content_drafts').insert({
    request_id: sessionId,
    provider_id: null,
    model_id: llmResult.model,
    research_topic_id: topicId,
    generated_thread: parsed as unknown as Record<string, unknown>,
    affiliate_injections: injection,
    status: 'needs_review',
    llm_meta: {
      provider: llmResult.providerSlug,
      model: llmResult.model,
      latency_ms: llmResult.latencyMs,
      key_hash: llmResult.keyHash
    },
    affiliate_match_score: affiliate?.matchScore ?? null,
    affiliate_match_signals:
      (affiliate?.signals as unknown as Record<string, unknown>) ?? null
  });
}

function parseThread(text: string): ThreadGeneration | null {
  const trimmed = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  const parsed = threadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  if (countPlaceholdersInThread(t) !== 1) return null;
  return t;
}

function replacePlaceholders(
  thread: ThreadGeneration,
  productUrl: string
): ThreadGeneration {
  const repl = (s: string) => s.split('{{PRODUCT_URL}}').join(productUrl);
  return {
    main: { id: repl(thread.main.id), en: repl(thread.main.en) },
    replies: thread.replies.map((r) => ({ id: repl(r.id), en: repl(r.en) }))
  };
}
