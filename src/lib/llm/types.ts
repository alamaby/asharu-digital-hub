export type ProviderSlug = 'naraya' | 'openrouter' | 'gemini' | 'cloudflare';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
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
