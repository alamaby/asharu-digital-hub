import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProviderRegistry } from './registry';
import { KeyPool } from './key-pool';
import type { ChatInput, ChatOutput, ProviderRow, LLMProvider } from './types';
import { LLMHttpError } from './types';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import { GeminiProvider } from './providers/gemini';
import { CloudflareProvider } from './providers/cloudflare';
import { fetchOrderedModels, markModelFailure, markModelUsage } from '@/lib/supabase/vault';

function providerFromRow(row: ProviderRow): LLMProvider {
  if (row.slug === 'gemini') return new GeminiProvider(row.base_url);
  if (row.slug === 'cloudflare') return new CloudflareProvider(row.base_url, row.config?.account_id ?? '');
  return new OpenAICompatibleProvider(row.slug, row.base_url);
}

export interface LLMCompletionInput {
  messages: ChatInput['messages'];
  temperature?: number;
  maxTokens?: number;
  /** Legacy: raw model_id string (e.g. 'naraya/agnes-2.5-flash'). Pinned single model. */
  modelHint?: string;
  /** Pinned provider UUID (llm_providers.id) — when set with modelUuid, filter to single provider. */
  providerId?: string | null;
  /** Pinned model UUID (llm_models.id) — resolved to model_id + config for the pinned attempt. */
  modelUuid?: string | null;
  /**
   * Optional legacy request id for llm_call_logs auditing (must be a
   * content_requests UUID or null). Research stages should pass the session
   * id via `sessionId` instead — request_id FK was dropped (see migration
   * 20260904000003) so free-form ids no longer fail, but session linkage
   * belongs in session_id.
   */
  requestId?: string | null;
  /** Optional research session id → llm_call_logs.session_id. */
  sessionId?: string | null;
  /** Stage tag for llm_call_logs (e.g. 'discovering'). */
  stage?: string;
}

/**
 * Run a single LLM completion with provider -> model -> key round-robin + fallback.
 * Order is DB-driven: llm_providers.priority, llm_models.priority/last_used_at, llm_provider_keys.priority/last_used_at.
 * For each provider, iterate its active models in DB order; for each model try its keys via KeyPool.
 * Reasoning effort is read from llm_models.config.reasoning / reasoning_effort.
 */
export async function runLLMCompletion(
  supabase: SupabaseClient,
  input: LLMCompletionInput
): Promise<{ output: ChatOutput; providerSlug: string; model: string; keyHash: string; latencyMs: number; fallback?: boolean }> {
  const registry = new ProviderRegistry();
  const providers = await registry.listActive();
  if (providers.length === 0) {
    throw new Error('No active LLM provider configured');
  }
  // If pinned provider+model, try pinned first with soft waterfall fallback
  if (input.modelUuid) {
    const pinned = await tryPinnedModel(supabase, input);
    if (pinned) return pinned;
    // Pinned failed → log warn only if sessionId present (P0-01: content_research_logs.session_id is FK NOT NULL)
    if (input.sessionId) {
      await supabase
        .from('content_research_logs')
        .insert({
          session_id: input.sessionId,
          stage: input.stage ?? 'unknown',
          level: 'warn',
          message: `Model pilihan gagal, fallback ke urutan global${input.stage ? ` (stage: ${input.stage})` : ''}`
        } as unknown as Record<string, unknown>)
        .then(() => undefined, () => undefined);
    } else {
      console.warn(`[llm] pinned model ${input.modelUuid} failed, no session — fallback to global waterfall (${input.stage ?? '-'})`);
    }
  }
  // Also support legacy modelHint as pinned string model_id
  if (input.modelHint && !input.modelUuid) {
    const pinnedHint = await tryPinnedModelHint(supabase, input);
    if (pinnedHint) return pinnedHint;
    if (input.sessionId) {
      await supabase
        .from('content_research_logs')
        .insert({
          session_id: input.sessionId,
          stage: input.stage ?? 'unknown',
          level: 'warn',
          message: `Model hint "${input.modelHint}" gagal, fallback ke urutan global${input.stage ? ` (stage: ${input.stage})` : ''}`
        } as unknown as Record<string, unknown>)
        .then(() => undefined, () => undefined);
    } else {
      console.warn(`[llm] modelHint "${input.modelHint}" failed, no session — fallback to global (${input.stage ?? '-'})`);
    }
  }
  let lastError: unknown = null;
  for (const prov of providers) {
    const pool = new KeyPool(prov);
    // DB-driven model order
    let candidateModels: { id: string; model_id: string; config: Record<string, unknown> | null }[] = [];
    const ordered = await fetchOrderedModels(prov.id);
    candidateModels = ordered.map((m) => ({ id: m.id, model_id: m.model_id, config: m.config as Record<string, unknown> | null }));
    if (candidateModels.length === 0) {
      const fallback = await pickDefaultModel(supabase, prov.id);
      candidateModels = [{ id: '__fallback__', model_id: fallback, config: null }];
    }

    for (const mod of candidateModels) {
      const reasoningEffort = resolveReasoningEffort(mod.config);
      try {
        const { result, keyRow } = await pool.withFallback(async (apiKey) => {
          const provider = providerFromRow(prov);
          return provider.chat(
            {
              model: mod.model_id,
              messages: input.messages,
              temperature: input.temperature,
              maxTokens: input.maxTokens,
              reasoningEffort
            },
            apiKey
          );
        });
        const output: ChatOutput = {
          ...result,
          provider: prov.slug,
          keyId: keyRow.id
        };
        // Empty-response guard (fix 815c8df8): HTTP 200 tapi text kosong —
        // jangan catat sebagai sukses; perlakukan sebagai failure agar
        // waterfall lanjut ke model berikutnya.
        if (!result.text || result.text.trim().length === 0) {
          const emptyMsg = `LLM returned empty response (provider ${prov.slug}, model ${result.model}, finish=${result.finishReason ?? 'unknown'}, latency ${result.latencyMs}ms)`;
          await supabase
            .from('llm_call_logs')
            .insert({
              request_id: input.requestId ?? null,
              session_id: input.sessionId ?? null,
              provider_slug: prov.slug,
              provider_id: prov.id,
              model_id: result.model,
              key_hash: keyRow.key_hash,
              key_id: keyRow.id,
              stage: input.stage ?? null,
              request_messages: input.messages as unknown as Record<string, unknown>,
              response_text: (result.rawPreview ?? '').slice(0, 8000),
              prompt_tokens: result.usage?.promptTokens ?? null,
              completion_tokens: result.usage?.completionTokens ?? null,
              total_tokens: result.usage?.totalTokens ?? null,
              finish_reason: result.finishReason ?? null,
              is_fallback: Boolean(input.modelUuid ?? input.modelHint),
              latency_ms: result.latencyMs,
              http_status: 200,
              error: emptyMsg.slice(0, 2000)
            } as unknown as Record<string, unknown>);
          if (mod.id !== '__hint__' && mod.id !== '__fallback__') {
            await markModelFailure(mod.id).catch(() => undefined);
          }
          lastError = new Error(emptyMsg);
          continue;
        }
        // RR bookkeeping for model (best-effort)
        if (mod.id !== '__hint__' && mod.id !== '__fallback__') {
          await markModelUsage(mod.id).catch(() => undefined);
        }
        {
          const { error: logError } = await supabase
            .from('llm_call_logs')
            .insert({
              request_id: input.requestId ?? null,
              session_id: input.sessionId ?? null,
              provider_slug: prov.slug,
              provider_id: prov.id,
              model_id: result.model,
              key_hash: keyRow.key_hash,
              key_id: keyRow.id,
              stage: input.stage ?? null,
              request_messages: input.messages as unknown as Record<string, unknown>,
              response_text: result.text.slice(0, 8000),
              prompt_tokens: result.usage?.promptTokens ?? null,
              completion_tokens: result.usage?.completionTokens ?? null,
              total_tokens: result.usage?.totalTokens ?? null,
              finish_reason: result.finishReason ?? null,
              is_fallback: Boolean(input.modelUuid ?? input.modelHint),
              latency_ms: result.latencyMs,
              http_status: 200
            } as unknown as Record<string, unknown>);
          if (logError) {
            console.error(`[llm] call log insert failed (${input.stage ?? '-'}): ${logError.message}`);
          }
        }
        return {
          output,
          providerSlug: prov.slug,
          model: result.model,
          keyHash: keyRow.key_hash,
          latencyMs: result.latencyMs,
          fallback: Boolean(input.modelUuid ?? input.modelHint)
        };
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        const { error: logError } = await supabase
          .from('llm_call_logs')
          .insert({
            request_id: input.requestId ?? null,
            session_id: input.sessionId ?? null,
            provider_slug: prov.slug,
            provider_id: prov.id,
            model_id: mod.model_id,
            stage: input.stage ?? null,
            request_messages: input.messages as unknown as Record<string, unknown>,
            error: msg.slice(0, 2000),
            http_status: e instanceof LLMHttpError ? e.status : null
          } as unknown as Record<string, unknown>);
        if (logError) {
          console.error(`[llm] error log insert failed (${input.stage ?? '-'}): ${logError.message}`);
        }
        // Continue to next model in same provider
      }
    }
  }
  throw lastError ?? new Error('All LLM providers failed');
}

function resolveReasoningEffort(config: Record<string, unknown> | null): 'max' | 'high' | undefined {
  if (!config) return undefined;
  if (config.reasoning === false) return undefined;
  const eff = (config.reasoning_effort as string | undefined) ?? (config.reasoningEffort as string | undefined);
  if (eff === 'max' || eff === 'high') return eff as 'max' | 'high';
  if (config.reasoning === true) return 'max';
  return undefined;
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

async function tryPinnedModel(
  supabase: SupabaseClient,
  input: LLMCompletionInput
): Promise<{ output: ChatOutput; providerSlug: string; model: string; keyHash: string; latencyMs: number; fallback?: boolean } | null> {
  const registry = new ProviderRegistry();
  // Resolve model row for model_id + config + correct provider — only active models (P0-02)
  const { data: modelRow } = await supabase.from('llm_models').select('id, provider_id, model_id, config, is_active').eq('id', input.modelUuid!).eq('is_active', true).maybeSingle();
  const model = modelRow as { id: string; provider_id: string; model_id: string; config: Record<string, unknown> | null; is_active: boolean } | null;
  if (!model) return null;
  // If providerId pinned, ensure it matches model's provider_id — log distinct mismatch (P1-05)
  const targetProviderId = input.providerId ?? model.provider_id;
  if (input.providerId && input.providerId !== model.provider_id) {
    if (input.sessionId) {
      await supabase.from('content_research_logs').insert({
        session_id: input.sessionId,
        stage: input.stage ?? 'unknown',
        level: 'warn',
        message: `provider/model mismatch (provider ${input.providerId} != model provider ${model.provider_id}), fallback ke global`
      } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
    }
    return null;
  }
  const providers = await registry.listActive();
  const prov = providers.find((p) => p.id === targetProviderId);
  if (!prov) return null;
  const pool = new KeyPool(prov);
  const reasoningEffort = resolveReasoningEffort(model.config);
  try {
    const { result, keyRow } = await pool.withFallback(async (apiKey) => {
      const provider = providerFromRow(prov);
      return provider.chat({ model: model.model_id, messages: input.messages, temperature: input.temperature, maxTokens: input.maxTokens, reasoningEffort }, apiKey);
    });
    if (!result.text || result.text.trim().length === 0) {
      const emptyMsg = `Model pilihan return kosong (provider ${prov.slug}, model ${result.model}, finish=${result.finishReason ?? 'unknown'}) — fallback ke urutan global`;
      await supabase.from('llm_call_logs').insert({
        request_id: input.requestId ?? null,
        session_id: input.sessionId ?? null,
        provider_slug: prov.slug,
        provider_id: prov.id,
        model_id: result.model,
        key_hash: keyRow.key_hash,
        key_id: keyRow.id,
        stage: input.stage ?? null,
        request_messages: input.messages as unknown as Record<string, unknown>,
        response_text: (result.rawPreview ?? '').slice(0, 8000),
        prompt_tokens: result.usage?.promptTokens ?? null,
        completion_tokens: result.usage?.completionTokens ?? null,
        total_tokens: result.usage?.totalTokens ?? null,
        finish_reason: result.finishReason ?? null,
        is_fallback: false,
        latency_ms: result.latencyMs,
        http_status: 200,
        error: emptyMsg.slice(0, 2000)
      } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
      await markModelFailure(model.id).catch(() => undefined);
      return null;
    }
    await markModelUsage(model.id).catch(() => undefined);
    await supabase.from('llm_call_logs').insert({
      request_id: input.requestId ?? null,
      session_id: input.sessionId ?? null,
      provider_slug: prov.slug,
      provider_id: prov.id,
      model_id: result.model,
      key_hash: keyRow.key_hash,
      key_id: keyRow.id,
      stage: input.stage ?? null,
      request_messages: input.messages as unknown as Record<string, unknown>,
      response_text: result.text.slice(0, 8000),
      prompt_tokens: result.usage?.promptTokens ?? null,
      completion_tokens: result.usage?.completionTokens ?? null,
      total_tokens: result.usage?.totalTokens ?? null,
      finish_reason: result.finishReason ?? null,
      is_fallback: false,
      latency_ms: result.latencyMs,
      http_status: 200
    } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
    return { output: { ...result, provider: prov.slug, keyId: keyRow.id }, providerSlug: prov.slug, model: result.model, keyHash: keyRow.key_hash, latencyMs: result.latencyMs, fallback: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from('llm_call_logs').insert({
      request_id: input.requestId ?? null,
      session_id: input.sessionId ?? null,
      provider_slug: prov.slug,
      provider_id: prov.id,
      model_id: model.model_id,
      stage: input.stage ?? null,
      request_messages: input.messages as unknown as Record<string, unknown>,
      error: msg.slice(0, 2000),
      http_status: e instanceof LLMHttpError ? e.status : null
    } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
    return null;
  }
}

async function tryPinnedModelHint(  supabase: SupabaseClient,
  input: LLMCompletionInput
): Promise<{ output: ChatOutput; providerSlug: string; model: string; keyHash: string; latencyMs: number; fallback?: boolean } | null> {
  // Single-provider resolve from model_id string — avoid looping all providers (P1-04)
  const { data: modelRow } = await supabase.from('llm_models').select('id, provider_id, model_id, config, is_active').eq('model_id', input.modelHint!).eq('is_active', true).maybeSingle();
  const model = modelRow as { id: string; provider_id: string; model_id: string; config: Record<string, unknown> | null; is_active: boolean } | null;
  let targetProviderId: string | null = null;
  let reasoningEffort: 'max' | 'high' | undefined = undefined;
  let resolvedModelId = input.modelHint!;
  if (model) {
    targetProviderId = model.provider_id;
    reasoningEffort = resolveReasoningEffort(model.config);
    resolvedModelId = model.model_id;
  }
  const registry = new ProviderRegistry();
  const providers = await registry.listActive();
  const providersToTry = targetProviderId ? providers.filter((p) => p.id === targetProviderId) : providers;
  if (providersToTry.length === 0) return null;
  for (const prov of providersToTry) {
    const pool = new KeyPool(prov);
    try {
      const { result, keyRow } = await pool.withFallback(async (apiKey) => {
        const provider = providerFromRow(prov);
        return provider.chat({ model: resolvedModelId, messages: input.messages, temperature: input.temperature, maxTokens: input.maxTokens, reasoningEffort }, apiKey);
      });
      if (!result.text || result.text.trim().length === 0) {
        const emptyMsg = `Model hint return kosong (provider ${prov.slug}, model ${result.model}) — lanjut fallback`;
        await supabase.from('llm_call_logs').insert({
          request_id: input.requestId ?? null,
          session_id: input.sessionId ?? null,
          provider_slug: prov.slug,
          provider_id: prov.id,
          model_id: result.model,
          key_hash: keyRow.key_hash,
          key_id: keyRow.id,
          stage: input.stage ?? null,
          request_messages: input.messages as unknown as Record<string, unknown>,
          response_text: (result.rawPreview ?? '').slice(0, 8000),
          prompt_tokens: result.usage?.promptTokens ?? null,
          completion_tokens: result.usage?.completionTokens ?? null,
          total_tokens: result.usage?.totalTokens ?? null,
          finish_reason: result.finishReason ?? null,
          is_fallback: false,
          latency_ms: result.latencyMs,
          http_status: 200,
          error: emptyMsg.slice(0, 2000)
        } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
        if (model) await markModelFailure(model.id).catch(() => undefined);
        continue;
      }
      if (model) await markModelUsage(model.id).catch(() => undefined);
      await supabase.from('llm_call_logs').insert({
        request_id: input.requestId ?? null,
        session_id: input.sessionId ?? null,
        provider_slug: prov.slug,
        provider_id: prov.id,
        model_id: result.model,
        key_hash: keyRow.key_hash,
        key_id: keyRow.id,
        stage: input.stage ?? null,
        request_messages: input.messages as unknown as Record<string, unknown>,
        response_text: result.text.slice(0, 8000),
        prompt_tokens: result.usage?.promptTokens ?? null,
        completion_tokens: result.usage?.completionTokens ?? null,
        total_tokens: result.usage?.totalTokens ?? null,
        finish_reason: result.finishReason ?? null,
        is_fallback: false,
        latency_ms: result.latencyMs,
        http_status: 200
      } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
      return { output: { ...result, provider: prov.slug, keyId: keyRow.id }, providerSlug: prov.slug, model: result.model, keyHash: keyRow.key_hash, latencyMs: result.latencyMs, fallback: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from('llm_call_logs').insert({
        request_id: input.requestId ?? null,
        session_id: input.sessionId ?? null,
        provider_slug: prov.slug,
        provider_id: prov.id,
        model_id: input.modelHint!,
        stage: input.stage ?? null,
        request_messages: input.messages as unknown as Record<string, unknown>,
        error: msg.slice(0, 2000),
        http_status: e instanceof LLMHttpError ? e.status : null
      } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
    }
  }
  return null;
}
