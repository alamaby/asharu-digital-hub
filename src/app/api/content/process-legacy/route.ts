import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { createSupabaseService } from '@/lib/supabase/server';
import { runLLMCompletion } from '@/lib/llm/completion';
import { buildThreadPrompt, countPlaceholdersInThread } from '@/lib/llm/prompt';
import { parseThread } from '@/lib/research/thread';
import type { ThreadGeneration } from '@/lib/llm/types';
import { z } from 'zod';

export const maxDuration = 60;

const threadSchema = z.object({
  main: z.object({ id: z.string().min(1), en: z.string().min(1) }),
  replies: z.array(z.object({ id: z.string().min(1), en: z.string().min(1) })).max(5)
});

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseService();
  if (!supabase) {
    return NextResponse.json({ error: 'service not configured' }, { status: 500 });
  }

  const { data: requests, error: reqError } = await supabase
    .from('content_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  if (reqError) {
    return NextResponse.json({ error: reqError.message }, { status: 500 });
  }
  if (!requests || requests.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No pending requests' });
  }

  let processed = 0;
  const errors: unknown[] = [];

  for (const req of requests as Array<{
    id: string;
    topic: string;
    platform_slug: string;
    tone: string;
    target_category: string | null;
    audience: string;
    cta_style: string;
    purpose: string;
    constraints: string | null;
    keywords: string | null;
    language: string;
    attempts: number;
  }>) {
    try {
      const { data: claimed } = await supabase
        .from('content_requests')
        .update({ status: 'processing' })
        .eq('id', req.id)
        .eq('status', 'pending')
        .select('id')
        .single();
      if (!claimed) throw new Error('Request already claimed by another worker');

      let productQuery = supabase
        .from('affiliate_products')
        .select('id, friendly_code, name_id, name_en, url, category, merchant, image, external_id')
        .eq('is_active', true);
      if (req.target_category) productQuery = productQuery.eq('category', req.target_category);
      const { data: products } = await productQuery.limit(20);
      if (!products || products.length === 0) throw new Error('No affiliate products found');
      const product = (products as Array<{
        id: string;
        friendly_code: string;
        name_id: string;
        name_en: string;
        url: string;
        category: string;
        merchant: string;
        image: string;
        external_id: string;
      }>)[Math.floor(Math.random() * products.length)]!;

      const { data: platform } = await supabase
        .from('platforms')
        .select('max_chars, slug')
        .eq('slug', req.platform_slug)
        .maybeSingle();
      const platformForPrompt = {
        slug: req.platform_slug,
        maxChars: (platform as { max_chars: number | null } | null)?.max_chars ?? null
      };

      const { system, user } = buildThreadPrompt(
        {
          topic: req.topic,
          platform: platformForPrompt,
          tone: req.tone,
          audience: req.audience,
          ctaStyle: req.cta_style,
          purpose: req.purpose,
          constraints: req.constraints,
          keywords: req.keywords,
          language: req.language,
          targetCategory: req.target_category,
          // Samakan dengan development flow: 6 konten + 1 affiliate = 7 untuk threads/twitter.
          targetReplyCount: req.platform_slug === 'threads' || req.platform_slug === 'twitter' ? 7 : null
        },
        {
          friendlyCode: product.friendly_code,
          name: product.name_id,
          url: product.url,
          category: product.category
        }
      );

      let success:
        | {
            providerSlug: string;
            model: string;
            keyHash: string;
            latency: number;
            text: string;
          }
        | null = null;
      try {
        const llmResult = await runLLMCompletion(supabase, {
          requestId: req.id,
          stage: 'legacy',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.7,
          maxTokens: 3200
        });
        success = {
          providerSlug: llmResult.providerSlug,
          model: llmResult.model,
          keyHash: llmResult.keyHash,
          latency: llmResult.latencyMs,
          text: llmResult.output.text
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`All providers failed — ${msg.slice(0, 500)}`);
      }

      // Parse thread (validate) — use shared parser for consistency with development flow
      let thread: ThreadGeneration;
      {
        const parsed = parseThread(success.text);
        if (!parsed) throw new Error(`Thread parse failed. Raw: ${success.text.slice(0, 1000)}`);
        const validated = threadSchema.safeParse(parsed);
        if (!validated.success) throw new Error(`Thread shape invalid: ${validated.error.message}`);
        if (countPlaceholdersInThread(validated.data) !== 1) {
          throw new Error(`Expected exactly 1 {{PRODUCT_URL}}, got ${countPlaceholdersInThread(validated.data)}`);
        }
        thread = validated.data;
      }

      // Replace placeholder
      const threadStr = JSON.stringify(thread);
      const replaced = JSON.parse(
        threadStr.replaceAll('{{PRODUCT_URL}}', product.url)
      ) as ThreadGeneration;

      // Detect post_index
      let postIndex = 0;
      const allPosts = [replaced.main, ...replaced.replies];
      for (let i = 0; i < allPosts.length; i++) {
        const p = allPosts[i]!;
        if (p.id.includes(product.url) || p.en.includes(product.url)) {
          postIndex = i;
          break;
        }
      }

      const { data: draft, error: draftError } = await supabase
        .from('content_drafts')
        .insert({
          request_id: req.id,
          provider_id: null,
          model_id: success.model,
          generated_thread: replaced as unknown as Record<string, unknown>,
          affiliate_injections: [
            {
              id: product.id,
              friendly_code: product.friendly_code,
              url: product.url,
              post_index: postIndex,
              product_name_id: product.name_id,
              product_name_en: product.name_en,
              product_image: product.image,
              product_category: product.category,
              product_merchant: product.merchant
            }
          ] as unknown as string,
          status: 'needs_review',
          llm_meta: {
            provider: success.providerSlug,
            model: success.model,
            latency_ms: success.latency,
            key_hash: success.keyHash
          }
        })
        .select('id')
        .single();

      if (draftError) throw draftError;

      await supabase
        .from('content_requests')
        .update({ status: 'needs_review' })
        .eq('id', req.id);
      await supabase.from('llm_call_logs').insert({
        request_id: req.id,
        draft_id: (draft as { id: string }).id,
        provider_slug: success.providerSlug,
        model_id: success.model,
        key_hash: success.keyHash,
        latency_ms: success.latency
      });

      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ id: req.id, error: msg });
      await supabase
        .from('content_requests')
        .update({ status: 'pending' })
        .eq('id', req.id);
      await supabase.from('llm_call_logs').insert({
        request_id: req.id,
        provider_slug: 'unknown',
        model_id: 'unknown',
        error: msg
      });
    }
  }

  return NextResponse.json({
    processed,
    total: requests.length,
    errors: errors.length ? errors : undefined
  });
}
