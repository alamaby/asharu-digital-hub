import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildThreadPrompt } from '@/lib/llm/prompt';
import { runLLMCompletion } from '@/lib/llm/completion';
import { selectAffiliateProduct, type SelectedAffiliate } from './affiliate';
import { parseThread, replacePlaceholders } from './thread';

interface ShortlistedTopic {
  id: string;
  topic: string;
  category: string | null;
  key_facts: unknown;
  hooks: unknown;
  unique_angle: string | null;
}

export async function runDevelopment(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { data: session, error: sessionError } = await supabase
    .from('content_research_sessions')
    .select('id, platform_slug, tone, account_goal, audience_age, audience_interests, target_location')
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) throw new Error('session not found');
  const sess = session as {
    id: string;
    platform_slug: string | null;
    tone: string | null;
    account_goal: string | null;
    audience_age: string | null;
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
  const topic = topics[0] as ShortlistedTopic;

  const platformSlug = sess.platform_slug ?? 'all';
  let maxChars: number | null = null;
  if (platformSlug === 'all') {
    // Platform-agnostic: use the strictest limit across active platforms so the
    // generated draft is safe to repost on any platform (e.g. Twitter 280).
    const { data: minRow } = await supabase
      .from('platforms')
      .select('max_chars')
      .eq('is_active', true)
      .not('max_chars', 'is', null)
      .order('max_chars', { ascending: true })
      .limit(1)
      .maybeSingle();
    maxChars = (minRow as { max_chars: number | null } | null)?.max_chars ?? 280;
  } else {
    const { data: platformRow } = await supabase
      .from('platforms')
      .select('max_chars')
      .eq('slug', platformSlug)
      .maybeSingle();
    maxChars = (platformRow as { max_chars: number | null } | null)?.max_chars ?? null;
  }
  const platform = {
    slug: platformSlug,
    maxChars
  };

  // Select affiliate (may be null if pool is empty).
  const affiliate = await selectAffiliateProduct(supabase, {
    topic: topic.topic,
    category: topic.category,
    unique_angle: topic.unique_angle,
    key_facts: Array.isArray(topic.key_facts) ? (topic.key_facts as string[]) : undefined,
    hooks: Array.isArray(topic.hooks)
      ? (topic.hooks as Array<{ type: string; text: string }>)
      : undefined
  });

  await generateAndInsertDraft(supabase, sessionId, topic.id, platform, sess, topic, affiliate);
}

async function generateAndInsertDraft(
  supabase: SupabaseClient,
  sessionId: string,
  topicId: string,
  platform: { slug: string; maxChars: number | null },
  sess: { tone: string | null; account_goal: string | null; audience_age: string | null },
  topic: ShortlistedTopic,
  affiliate: SelectedAffiliate | null
): Promise<void> {
  const tone = sess.tone ?? 'casual';
  const audience = sess.audience_age ?? 'umum';
  const purpose = sess.account_goal ?? 'membagikan informasi bermanfaat';

  // Synthesize a placeholder product for the LLM when no affiliate matched.
  const promptProduct = affiliate
    ? {
        friendlyCode: affiliate.product.friendly_code,
        name: affiliate.product.name_id,
        url: affiliate.product.url,
        category: affiliate.product.category
      }
    : {
        friendlyCode: 'NONE',
        name: 'tanpa afiliasi',
        url: 'https://example.com',
        category: '-'
      };

  const { system, user } = buildThreadPrompt(
    {
      topic: topic.topic,
      platform: { slug: platform.slug, maxChars: platform.maxChars },
      tone,
      audience,
      ctaStyle: 'soft_sell',
      purpose,
      language: 'both'
    },
    promptProduct
  );

  const llmResult = await runLLMCompletion(supabase, {
    requestId: sessionId,
    stage: 'developing',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.7
  });

  const parsed = parseThread(llmResult.output.text);
  if (!parsed) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'error',
      message: `development LLM raw (first 2000 chars): ${llmResult.output.text.slice(0, 2000)}`
    });
    throw new Error('thread parse failed');
  }

  // Replace placeholders only when an affiliate was selected.
  const replaced = affiliate
    ? replacePlaceholders(parsed, affiliate.product.url)
    : parsed;

  // Look up provider_id from slug (for the foreign key).
  const { data: providerRow } = await supabase
    .from('llm_providers')
    .select('id')
    .eq('slug', llmResult.providerSlug)
    .maybeSingle();
  const providerId = (providerRow as { id: string } | null)?.id ?? null;

  const injection = affiliate
    ? [
        {
          friendly_code: affiliate.product.friendly_code,
          url: affiliate.product.url,
          post_index: 0,
          match_score: affiliate.matchScore,
          match_signals: affiliate.signals
        }
      ]
    : [];

  const { error: draftError } = await supabase.from('content_drafts').insert({
    request_id: sessionId,
    provider_id: providerId,
    model_id: llmResult.model,
    research_topic_id: topicId,
    generated_thread: replaced as unknown as Record<string, unknown>,
    affiliate_injections: injection as unknown as Record<string, unknown>[],
    status: 'needs_review',
    llm_meta: {
      provider: llmResult.providerSlug,
      model: llmResult.model,
      latency_ms: llmResult.latencyMs,
      key_hash: llmResult.keyHash
    },
    affiliate_match_score: affiliate?.matchScore ?? null,
    affiliate_match_signals: affiliate
      ? (affiliate.signals as unknown as Record<string, unknown>)
      : null
  });
  if (draftError) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'error',
      message: `draft insert failed: ${draftError.message}`
    });
    throw new Error(`draft insert failed: ${draftError.message}`);
  }

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'developing',
    level: 'info',
    message: affiliate
      ? `draft generated with affiliate ${affiliate.product.friendly_code} (match ${affiliate.matchScore})`
      : 'draft generated without affiliate (empty pool)'
  });
}
