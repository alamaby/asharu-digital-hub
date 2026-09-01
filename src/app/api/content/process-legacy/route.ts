import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { createSupabaseService } from '@/lib/supabase/server';
import { ProviderRegistry } from '@/lib/llm/registry';
import { KeyPool } from '@/lib/llm/key-pool';
import { OpenAICompatibleProvider } from '@/lib/llm/providers/openai-compatible';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { CloudflareProvider } from '@/lib/llm/providers/cloudflare';
import {
  buildThreadPrompt,
  countPlaceholdersInThread
} from '@/lib/llm/prompt';
import type { ThreadGeneration } from '@/lib/llm/types';
import { z } from 'zod';

export const maxDuration = 60;

const threadSchema = z.object({
  main: z.object({ id: z.string().min(1), en: z.string().min(1) }),
  replies: z.array(z.object({ id: z.string().min(1), en: z.string().min(1) })).max(5)
});

function providerFactory(slug: string, baseUrl: string, config?: Record<string, string>) {
  if (slug === 'gemini') return new GeminiProvider(baseUrl);
  if (slug === 'cloudflare') return new CloudflareProvider(baseUrl, config?.account_id ?? '');
  return new OpenAICompatibleProvider(slug as never, baseUrl);
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

  const supabase = createSupabaseService();
  if (!supabase) {
    return NextResponse.json({ error: 'service not configured' }, { status: 500 });
  }
  const registry = new ProviderRegistry();

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
        .select('friendly_code, name_id, name_en, url, category, external_id')
        .eq('is_active', true);
      if (req.target_category) productQuery = productQuery.eq('category', req.target_category);
      const { data: products } = await productQuery.limit(20);
      if (!products || products.length === 0) throw new Error('No affiliate products found');
      const product = (products as Array<{
        friendly_code: string;
        name_id: string;
        name_en: string;
        url: string;
        category: string;
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
          targetCategory: req.target_category
        },
        {
          friendlyCode: product.friendly_code,
          name: product.name_id,
          url: product.url,
          category: product.category
        }
      );

      const providers = await registry.listActive();
      const providerErrors: string[] = [];
      let success:
        | {
            thread: ThreadGeneration;
            providerSlug: string;
            model: string;
            keyHash: string;
            latency: number;
          }
        | null = null;

      for (const prov of providers) {
        const pool = new KeyPool(prov);
        try {
          const { result, keyRow } = await pool.withFallback(async (apiKey) => {
            const provider = providerFactory(prov.slug, prov.base_url, prov.config);
            const { data: models } = await supabase
              .from('llm_models')
              .select('model_id')
              .eq('provider_id', prov.id)
              .eq('is_default', true)
              .limit(1);
            const model =
              (models?.[0] as { model_id: string } | undefined)?.model_id ??
              (prov.slug === 'naraya' ? 'nemotron-3-ultra' : 'openai/gpt-4o-mini');
            return provider.chat(
              {
                model,
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: user }
                ],
                temperature: 0.7
              },
              apiKey
            );
          });
          success = {
            thread: result as unknown as ThreadGeneration,
            providerSlug: prov.slug,
            model: result.model,
            keyHash: keyRow.key_hash,
            latency: result.latencyMs
          };
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          providerErrors.push(`${prov.slug}: ${msg.slice(0, 300)}`);
        }
      }

      if (!success) throw new Error(`All providers failed — ${providerErrors.join(' | ') || 'no providers'}`);

      // Parse thread (validate)
      const parsedJson = (() => {
        try {
          return JSON.parse(success.thread.main.id); // placeholder; real parse below
        } catch {
          return null;
        }
      })();
      void parsedJson;
      const raw = success.thread as unknown as Record<string, unknown>;
      let thread: ThreadGeneration;
      try {
        thread = (raw as { main: { id: string; en: string }; replies: Array<{ id: string; en: string }> });
        const validated = threadSchema.safeParse(thread);
        if (!validated.success) throw new Error(`Thread shape invalid: ${validated.error.message}`);
        if (countPlaceholdersInThread(validated.data) !== 1) {
          throw new Error(`Expected exactly 1 {{PRODUCT_URL}}, got ${countPlaceholdersInThread(validated.data)}`);
        }
        thread = validated.data;
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e));
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
            { friendly_code: product.friendly_code, url: product.url, post_index: postIndex }
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
