/** Tipe domain Studio generate image (user login) — configurable by table. */

export type StudioImageStatus = 'pending' | 'ready' | 'failed';

export interface StudioAspectRow {
  slug: string;
  display_name: string;
  width: number;
  height: number;
  sort_order: number;
  is_active: boolean;
}

export interface StudioConfig {
  id: number;
  retention_days: number;
  daily_limit: number | null;
  default_provider_id: string | null;
  default_model_id: string | null;
  default_style_slug: string | null;
  default_subject_slug: string | null;
  default_camera_slug: string | null;
  default_aspect_slug: string;
  max_prompt_length: number;
  allow_empty_prompt: boolean;
  polling_interval_sec: number;
}

export const DEFAULT_STUDIO_CONFIG: StudioConfig = {
  id: 1,
  retention_days: 30,
  daily_limit: 20,
  default_provider_id: null,
  default_model_id: null,
  default_style_slug: null,
  default_subject_slug: null,
  default_camera_slug: null,
  default_aspect_slug: '1:1',
  max_prompt_length: 500,
  allow_empty_prompt: false,
  polling_interval_sec: 10
};

export interface StudioGenerationRow {
  id: string;
  user_id: string;
  image_prompt: string;
  negative_prompt: string | null;
  provider_id: string | null;
  model_id: string | null;
  style_slug: string | null;
  subject_slug: string | null;
  camera_slug: string | null;
  aspect_slug: string;
  provider_slug: string;
  model_slug: string;
  storage_path: string | null;
  public_url: string | null;
  width: number | null;
  height: number | null;
  status: StudioImageStatus;
  last_error: string | null;
  attempts: number;
  llm_meta: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface StudioOptions {
  providers: { id: string; slug: string; display_name: string }[];
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
  styles: { slug: string; display_name: string }[];
  subjects: { slug: string; display_name: string }[];
  cameras: { slug: string; display_name: string }[];
  aspects: StudioAspectRow[];
  config: StudioConfig;
  /** Pilihan provider/model LLM untuk tombol enhance prompt (llm_* aktif). */
  llmProviders: { id: string; slug: string; display_name: string }[];
  llmModels: { id: string; provider_id: string; model_id: string; display_name: string }[];
}

/** Filter + sort riwayat studio (semua kolom sudah ada di user_image_generations). */
export interface StudioListOptions {
  status?: 'pending' | 'ready' | 'failed' | 'all';
  limit?: number;
  /** Sort tanggal: dibuat (default) atau diperbarui. */
  sortBy?: 'created_at' | 'updated_at';
  dir?: 'asc' | 'desc';
  /** Pin request user (UUID) — baris Auto (null) tidak ikut filter ini. */
  providerId?: string | null;
  modelId?: string | null;
  /** Parameter enqueue berbasis slug. */
  styleSlug?: string | null;
  subjectSlug?: string | null;
  cameraSlug?: string | null;
  aspectSlug?: string | null;
}

/** Hasil enhance prompt studio (bentuk sama dengan EnhancePromptResult review). */
export interface StudioEnhanceResult {
  image_prompt: string;
  negative_prompt?: string;
  reasoning: {
    visual_strategy: string;
    hook_keywords?: string[];
    contradiction_check?: string;
    justification?: string;
  };
}

export interface StudioQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
}
