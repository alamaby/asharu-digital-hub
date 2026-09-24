/** Tipe domain Endpoint Try — eksperimen endpoint OpenAI/Anthropic arbitrer. */

/** Kind adapter: OpenAI-compatible atau Anthropic Messages API. */
export type EndpointKind = 'openai' | 'anthropic';

/** Pesan chat tunggal (server-client). */
export interface EndpointChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Hasil list model dari upstream (dimurnikan adapter). */
export interface EndpointModelsResult {
  models: { id: string; ownedBy: string | null }[];
  latencyMs: number;
}

/** Hasil chat non-stream dari proxy (tanpa key transit). */
export interface EndpointChatResult {
  text: string;
  usage:
    | { promptTokens: number; completionTokens: number; totalTokens?: number }
    | null;
  finishReason: string | null;
  latencyMs: number;
  tokensPerSec: number | null;
}

/** Baris `endpoint_try_runs` — cerminan kolom migrasi `20260924000001`. */
export interface EndpointTryRunRow {
  id: string;
  user_id: string;
  provider_kind: EndpointKind;
  base_url: string;
  model: string;
  system_prompt: string | null;
  user_prompt: string;
  temperature: number | null;
  max_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  tokens_per_sec: number | null;
  finish_reason: string | null;
  error: string | null;
  request_messages: unknown;
  response_text: string | null;
  expires_at: string;
  created_at: string;
}

/** Scope rate-limit internal untuk endpoint try (bebas Lab). */
export const ENDPOINT_TRY_RATE_SCOPE = 'endpoint_try' as const;
/** Batas atas max_tokens yang diizinkan (sesuai DB CHECK). */
export const ENDPOINT_TRY_MAX_TOKENS = 4000 as const;

/** Payload simpan ke `endpoint_try_runs` — tanpa properti key apa pun. */
export interface SaveEndpointTryRunInput {
  providerKind: EndpointKind;
  baseUrl: string;
  model: string;
  systemPrompt: string | null;
  userPrompt: string;
  temperature: number | null;
  maxTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  tokensPerSec: number | null;
  finishReason: string | null;
  error: string | null;
  requestMessages: unknown;
  responseText: string | null;
}

export interface EndpointTryQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
}
