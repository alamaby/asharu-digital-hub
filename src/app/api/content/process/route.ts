import { NextRequest, NextResponse } from 'next/server';
import { ProviderRegistry } from '@/lib/llm/registry';
import { KeyPool } from '@/lib/llm/key-pool';
import { OpenAICompatibleProvider } from '@/lib/llm/providers/openai-compatible';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { CloudflareProvider } from '@/lib/llm/providers/cloudflare';
import { buildThreadPrompt, countPlaceholdersInThread } from '@/lib/llm/prompt';
import type { ThreadGeneration } from '@/lib/llm/types';
import { getServiceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { z } from 'zod';

const threadSchema = z.object({
  main: z.object({ id: z.string().min(1), en: z.string().min(1) }),
  replies: z.array(z.object({ id: z.string().min(1), en: z.string().min(1) })).max(5)
});

export const maxDuration = 60;

function providerFactory(slug: string, baseUrl: string, config?: Record<string, string>) {
  if (slug === 'gemini') return new GeminiProvider(baseUrl);
  if (slug === 'cloudflare') return new CloudflareProvider(baseUrl, config?.account_id ?? '');
  return new OpenAICompatibleProvider(slug as never, baseUrl);
}

function isCronAuthorized(request: NextRequest): boolean {
  // Vercel Cron always sends x-vercel-cron
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = env.cronSecret ?? process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;
  // Dev only: allow without secret
  if (!secret && process.env.NODE_ENV !== 'production') return true;
  return false;
}

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

  const supabase = getServiceClient();
  const registry = new ProviderRegistry();

  // Fetch pending requests (SKIP LOCKED to avoid race with concurrent cron)
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

  for (const req of requests) {
    try {
      // Optimistic lock: only move to processing if still pending (mitigates concurrent cron without SKIP LOCKED)
      const { data: claimed, error: claimError } = await supabase
        .from('content_requests')
        .update({ status: 'processing' })
        .eq('id', req.id)
        .eq('status', 'pending')
        .select('id')
        .single();
      if (claimError || !claimed) throw new Error('Request already claimed by another worker');

      // Pick 1 product
      let productQuery = supabase
        .from('affiliate_products')
        .select('friendly_code, name_id, name_en, url, category, external_id')
        .eq('is_active', true);
      if (req.target_category) {
        productQuery = productQuery.eq('category', req.target_category);
      }
      const { data: products } = await productQuery.limit(20);
      if (!products || products.length === 0) throw new Error('No affiliate products found');
      const product = products[Math.floor(Math.random() * products.length)] as {
        friendly_code: string;
        name_id: string;
        name_en: string;
        url: string;
        category: string;
      };

      // Platform max_chars
      const { data: platform } = await supabase
        .from('platforms')
        .select('max_chars, slug')
        .eq('slug', req.platform_slug)
        .maybeSingle();

      const prompt = buildThreadPrompt(
        {
          topic: req.topic,
          platform: { slug: req.platform_slug, maxChars: (platform as { max_chars: number | null } | null)?.max_chars ?? null },
          tone: req.tone,
          audience: req.audience,
          ctaStyle: req.cta_style,
          purpose: req.purpose,
          constraints: req.constraints,
          keywords: req.keywords,
          language: req.language,
          targetCategory: req.target_category
        },
        {
          friendlyCode: product.friendly_code,
          name: product.name_id,
          url: product.url,
          category: product.category
        }
      );

      // Try providers in priority order
      const providers = await registry.listActive();
      let lastError: unknown;
      let success: { thread: ThreadGeneration; providerSlug: string; model: string; keyHash: string; latency: number } | null = null;

      for (const prov of providers) {
        const pool = new KeyPool(prov);
        try {
          const { result, keyRow } = await pool.withFallback(async (apiKey) => {
            const provider = providerFactory(prov.slug, prov.base_url, prov.config);
            // Use default model for provider
            const { data: models } = await supabase
              .from('llm_models')
              .select('model_id')
              .eq('provider_id', prov.id)
              .eq('is_default', true)
              .limit(1);
            const model = (models?.[0] as { model_id: string } | undefined)?.model_id ?? (prov.slug === 'naraya' ? 'naraya/nemotron-3-ultra' : 'openai/gpt-4o-mini');
            const out = await provider.chat(
              {
                model,
                messages: [
                  { role: 'system', content: prompt.system },
                  { role: 'user', content: prompt.user }
                ],
                temperature: 0.7
              },
              apiKey
            );
            // Parse JSON thread
            let parsed: ThreadGeneration;
            try {
              parsed = JSON.parse(out.text) as ThreadGeneration;
            } catch {
              // Try to extract JSON block
              const match = out.text.match(/\{[\s\S]*\}/);
              if (!match) throw new Error(`Invalid JSON: ${out.text.slice(0, 200)}`);
              parsed = JSON.parse(match[0]) as ThreadGeneration;
            }
            const parsedResult = threadSchema.safeParse(parsed);
            if (!parsedResult.success) throw new Error(`Thread shape invalid: ${parsedResult.error.message}`);
            if (countPlaceholdersInThread(parsed) !== 1) throw new Error(`Expected exactly 1 {{PRODUCT_URL}}, got ${countPlaceholdersInThread(parsed)}`);
            // Validate max_chars per platform
            const maxChars = (platform as { max_chars: number | null } | null)?.max_chars;
            if (maxChars) {
              const allPosts = [parsed.main, ...parsed.replies];
              for (const p of allPosts) {
                if (p.id.length > maxChars || p.en.length > maxChars) {
                  throw new Error(`Post exceeds max_chars ${maxChars}: id ${p.id.length}, en ${p.en.length}`);
                }
              }
            }
            return { parsed, model, out };
          });
          success = {
            thread: result.parsed as ThreadGeneration,
            providerSlug: prov.slug,
            model: result.model,
            keyHash: keyRow.key_hash,
            latency: result.out.latencyMs
          };
          break;
        } catch (e) {
          lastError = e;
          // Try next provider
        }
      }

      if (!success) throw lastError ?? new Error('All providers failed');

      // Replace placeholder with real URL
      const threadStr = JSON.stringify(success.thread);
      const replaced = threadStr.replaceAll('{{PRODUCT_URL}}', product.url);
      const thread = JSON.parse(replaced) as ThreadGeneration;

      // Detect post_index where product was injected (check all posts)
      let postIndex = 0;
      const allPosts = [thread.main, ...thread.replies];
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
          provider_id: providers.find((p) => p.slug === success!.providerSlug)?.id,
          model_id: success.model,
          generated_thread: thread as unknown as Record<string, unknown>,
          affiliate_injections: [{ friendly_code: product.friendly_code, url: product.url, post_index: postIndex }] as unknown as string,
          status: 'needs_review',
          llm_meta: { provider: success.providerSlug, model: success.model, latency_ms: success.latency, key_hash: success.keyHash }
        })
        .select('id')
        .single();

      if (draftError) throw draftError;

      await supabase.from('content_requests').update({ status: 'needs_review' }).eq('id', req.id);
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
      await supabase.from('content_requests').update({ status: 'pending' }).eq('id', req.id);
      await supabase.from('llm_call_logs').insert({
        request_id: req.id,
        provider_slug: 'unknown',
        model_id: 'unknown',
        error: msg
      });
    }
  }

  return NextResponse.json({ processed, total: requests.length, errors: errors.length ? errors : undefined });
}
