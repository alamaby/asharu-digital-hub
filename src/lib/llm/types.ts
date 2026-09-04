export type ProviderSlug = 'naraya' | 'openrouter' | 'gemini' | 'cloudflare';

/** 6 LLM stages that support per-stage provider→model pinning */
export type LLMStage = 'idea_generation' | 'discovering' | 'verifying' | 'scoring' | 'developing' | 'regen_affiliate';
export const LLM_STAGES: readonly LLMStage[] = [
  'idea_generation',
  'discovering',
  'verifying',
  'scoring',
  'developing',
  'regen_affiliate'
] as const;

/**
 * HTTP-level failure from an LLM provider (non-2xx response). Carrying the
 * status lets KeyPool distinguish key-blamable errors (401/403/429) from
 * provider outages (5xx) and content validation failures (plain Error).
 */
export class LLMHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'LLMHttpError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Max reasoning effort — set to "max" when model supports it. Forwarded as reasoning_effort. */
  reasoningEffort?: 'max' | 'high' | 'medium' | 'low';
}

export interface ChatOutput {
  text: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens?: number };
  provider: ProviderSlug;
  model: string;
  keyId: string;
  latencyMs: number;
}

export interface LLMProvider {
  readonly slug: ProviderSlug;
  chat(input: ChatInput, apiKey: string): Promise<Omit<ChatOutput, 'keyId' | 'provider'>>;
}

export interface ThreadGeneration {
  main: { id: string; en: string };
  replies: { id: string; en: string }[];
}

export interface ProviderRow {
  id: string;
  slug: ProviderSlug;
  display_name: string;
  base_url: string;
  is_active: boolean;
  priority: number;
  /** Provider-level non-secret config (e.g. { account_id } for cloudflare). */
  config?: Record<string, string>;
}

export interface KeyRow {
  id: string;
  provider_id: string;
  vault_secret_id: string | null;
  key_hash: string;
  priority: number;
  usage_count: number;
  failure_count: number;
  last_used_at: string | null;
  is_active: boolean;
}

export interface ModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  is_default: boolean;
  priority: number;
  is_active: boolean;
  last_used_at: string | null;
  config: Record<string, unknown> | null;
  usage_count: number;
  failure_count: number;
}
