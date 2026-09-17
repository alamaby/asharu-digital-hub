/** Tipe domain Chat Lab: uji provider/model chat untuk user login. */

export interface LabConfig {
  id: number;
  retention_days: number;
  daily_limit: number | null;
  max_targets: number;
  default_temperature: number | null;
  default_max_tokens: number;
}

export const DEFAULT_LAB_CONFIG: LabConfig = {
  id: 1,
  retention_days: 30,
  daily_limit: 50,
  max_targets: 3,
  default_temperature: 0.7,
  default_max_tokens: 1000
};

/** Satu target komparasi: pin provider+model (UUID). Keduanya wajib bila target diisi. */
export interface LabTarget {
  providerId: string;
  modelId: string;
}

export interface LabBatchRow {
  id: string;
  user_id: string;
  system_prompt: string | null;
  user_prompt: string;
  temperature: number | null;
  max_tokens: number | null;
  expires_at: string;
  created_at: string;
}

export interface LabRunRow {
  id: string;
  batch_id: string;
  user_id: string;
  provider_id: string | null;
  model_id: string | null;
  provider_slug: string;
  model_slug: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  thought_tokens: number | null;
  latency_ms: number | null;
  /** Token output per detik (derived fase 1); NULL bila token/latency tak diketahui. */
  tokens_per_sec: number | null;
  /** Fase 2 streaming (SSE); fase 1 selalu NULL. */
  ttft_ms: number | null;
  finish_reason: string | null;
  is_fallback: boolean;
  response_truncated: boolean;
  http_status: number | null;
  error: string | null;
  request_messages: unknown;
  response_text: string | null;
  expires_at: string;
  created_at: string;
}

export interface LabBatchWithRuns {
  batch: LabBatchRow;
  runs: LabRunRow[];
}

export interface LabOptions {
  providers: { id: string; slug: string; display_name: string }[];
  models: { id: string; provider_id: string; model_id: string; display_name: string }[];
  config: LabConfig;
}

export interface LabListOptions {
  limit?: number;
  /** Sort tanggal batch: dibuat (default). */
  sortBy?: 'created_at';
  dir?: 'asc' | 'desc';
  providerSlug?: string | null;
  modelSlug?: string | null;
  /** ok = semua run sukses; error = min. 1 run error. */
  status?: 'all' | 'ok' | 'error';
}

export interface LabQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
}
