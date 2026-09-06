/** Image generation domain types — configurable by table (tiru pola llm/types.ts). */

export type ImageProviderSlug = 'pixazo' | 'cloudflare' | 'pollinations' | 'gemini' | 'bynara';

export type ImageAspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type DraftImageStatus = 'pending' | 'ready' | 'failed' | 'selected';

/**
 * HTTP-level failure dari provider image (non-2xx). Status dibawa agar
 * key pool bisa membedakan key-blamable (401/403/429) dari outage (5xx)
 * dan validasi konten (plain Error) — tiru LLMHttpError.
 */
export class ImageHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ImageHttpError';
  }
}

export interface GenerateImageInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: ImageAspect;
  seed?: number;
  /** Provider-specific options (num_steps, size, ...). */
  parameters?: Record<string, unknown>;
}

export interface ImageGenerationResult {
  status: 'completed';
  /** Remote https URL (Pixazo) — worker wajib fetch + re-upload ke Storage. */
  imageUrl?: string;
  /** Raw bytes (Cloudflare/Gemini/Bynara/Pollinations b64_json). */
  imageBytes?: Uint8Array;
  mimeType: string;
  width?: number;
  height?: number;
  providerRequestId?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageProviderRow {
  id: string;
  slug: ImageProviderSlug;
  display_name: string;
  base_url: string;
  is_active: boolean;
  priority: number;
  /** Non-secret config (mis. { account_id } untuk cloudflare). */
  config?: Record<string, string>;
}

export interface ImageModelRow {
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

export interface ImageKeyRow {
  id: string;
  provider_id: string;
  vault_secret_id: string | null;
  vault_secret_name: string;
  key_hash: string;
  key_suffix: string | null;
  label: string;
  priority: number;
  usage_count: number;
  failure_count: number;
  last_used_at: string | null;
  is_active: boolean;
}

export interface ImageStylePreset {
  slug: string;
  display_name: string;
  prompt_suffix: string;
  is_active: boolean;
}

export interface ImageGenDefaults {
  id: number;
  provider_id: string | null;
  model_id: string | null;
  style_slug: string | null;
  aspect: ImageAspect;
}

export interface DraftImageRow {
  id: string;
  draft_id: string;
  image_prompt: string;
  negative_prompt: string | null;
  style_slug: string | null;
  provider_slug: string;
  model_id: string;
  key_suffix: string | null;
  storage_path: string | null;
  public_url: string | null;
  width: number | null;
  height: number | null;
  status: DraftImageStatus;
  last_error: string | null;
  attempts: number;
  llm_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
