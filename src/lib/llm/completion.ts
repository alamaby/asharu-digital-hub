import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProviderRegistry } from './registry';
import { KeyPool } from './key-pool';
import type { ChatInput, ChatOutput, ProviderRow, LLMProvider } from './types';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import { GeminiProvider } from './providers/gemini';
import { CloudflareProvider } from './providers/cloudflare';

function providerFromRow(row: ProviderRow): LLMProvider {
  if (row.slug === 'gemini') return new GeminiProvider(row.base_url);
  if (row.slug === 'cloudflare') return new CloudflareProvider(row.base_url, row.config?.account_id ?? '');
  return new OpenAICompatibleProvider(row.slug, row.base_url);
}

export interface LLMCompletionInput {
  messages: ChatInput['messages'];
  temperature?: number;
  maxTokens?: number;
  modelHint?: string; // optional partial match; falls back to provider default
}

/**
 * Run a single LLM completion with provider fallback.
 * Tries each active provider in priority order; on HTTP failure (4xx/5xx)
 * moves to the next provider; on content/parse error stops with the last
 * error so the caller can decide.
 */
export async function runLLMCompletion(
  supabase: SupabaseClient,
  input: LLMCompletionInput
): Promise<{ output: ChatOutput; providerSlug: string; model: string; keyHash: string; latencyMs: number }> {
  const registry = new ProviderRegistry();
  const providers = await registry.listActive();
  if (providers.length === 0) {
    throw new Error('No active LLM provider configured');
  }
  let lastError: unknown = null;
  for (const prov of providers) {
    const pool = new KeyPool(prov);
    try {
      const { result, keyRow } = await pool.withFallback(async (apiKey) => {
        const provider = providerFromRow(prov);
        const model = input.modelHint ?? (await pickDefaultModel(supabase, prov.id));
        return provider.chat(
          {
            model,
            messages: input.messages,
            temperature: input.temperature,
            maxTokens: input.maxTokens
          },
          apiKey
        );
      });
      const output: ChatOutput = {
        ...result,
        provider: prov.slug,
        keyId: keyRow.id
      };
      return {
        output,
        providerSlug: prov.slug,
        model: result.model,
        keyHash: keyRow.key_hash,
        latencyMs: result.latencyMs
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('All LLM providers failed');
}

async function pickDefaultModel(supabase: SupabaseClient, providerId: string): Promise<string> {
  const { data: models } = await supabase
    .from('llm_models')
    .select('model_id')
    .eq('provider_id', providerId)
    .eq('is_default', true)
    .limit(1);
  return (models?.[0] as { model_id: string } | undefined)?.model_id ?? 'openai/gpt-4o-mini';
}
