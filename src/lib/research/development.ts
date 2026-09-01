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

  await supabase.from('content_drafts').insert({
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

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'developing',
    level: 'info',
    message: affiliate
      ? `draft generated with affiliate ${affiliate.product.friendly_code} (match ${affiliate.matchScore})`
      : 'draft generated without affiliate (empty pool)'
  });
}

function normalizePlaceholder(thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] }): { main: { id: string; en: string }; replies: { id: string; en: string }[] } {
  // Collect all text and count placeholders.
  const all = [thread.main.id, thread.main.en, ...thread.replies.flatMap((r) => [r.id, r.en])];
  const total = all.reduce((sum, s) => sum + (s.match(/\{\{PRODUCT_URL\}\}/g)?.length ?? 0), 0);
  if (total === 1) return thread;
  if (total === 0) {
    // Inject one placeholder into the main post (natural location).
    return {
      main: { id: `${thread.main.id} {{PRODUCT_URL}}`.trim(), en: thread.main.en },
      replies: thread.replies
    };
  }
  // > 1: keep first, strip the rest.
  const strip = (s: string): string => {
    let count = (s.match(/\{\{PRODUCT_URL\}\}/g) ?? []).length;
    if (count <= 1) return s;
    let out = s;
    while (count > 1) {
      out = out.replace('{{PRODUCT_URL}}', '');
      count -= 1;
    }
    return out;
  };
  return {
    main: { id: strip(thread.main.id), en: strip(thread.main.en) },
    replies: thread.replies.map((r) => ({ id: strip(r.id), en: strip(r.en) }))
  };
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
  const normalized = normalizePlaceholder(t);
  if (countPlaceholdersInThread(normalized) !== 1) return null;
  return normalized;
}

function replacePlaceholders(
  thread: ThreadGeneration,
  productUrl: string
): ThreadGeneration {
  const repl = (s: string) => s.split('{{PRODUCT_URL}}').join(productUrl);
  return {
    main: { id: repl(thread.main.id), en: repl(thread.main.en) },
    replies: thread.replies.map((r: { id: string; en: string }) => ({ id: repl(r.id), en: repl(r.en) }))
  };
}
