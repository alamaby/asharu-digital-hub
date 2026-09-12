/** Image generation domain types — configurable by table (tiru pola llm/types.ts). */

export type ImageProviderSlug = 'pixazo' | 'cloudflare' | 'pollinations' | 'gemini' | 'bynara';

export type ImageAspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type DraftImageStatus = 'pending' | 'prompt_ready' | 'ready' | 'failed' | 'selected';

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
  /**
   * Base64 mentah gambar referensi (tanpa prefix data:) untuk img2img
   * Cloudflare (`image_b64`). Hanya dipakai model SD img2img; Flux menolak.
   */
  referenceImageB64?: string;
  /** Kekuatan transformasi img2img 0–1 (rendah = dekat referensi). Default 0.6. */
  strength?: number;
  /** Jumlah diffusion steps img2img (1–20). Default 10. */
  numSteps?: number;
  /** Dimensi eksplisit img2img (256–2048); fallback dari aspectRatio. */
  width?: number;
  height?: number;
}

/**
 * Model Cloudflare img2img fase 1 (parameter `image_b64` + `strength`).
 * Dreamshaper + inpainting menyusul fase 2.
 */
export const SUPPORTED_IMG2IMG_MODELS = [
  '@cf/runwayml/stable-diffusion-v1-5-img2img',
  '@cf/bytedance/stable-diffusion-xl-lightning'
] as const;

/** Default strength 0.6 (bukan 1 ala docs) agar output dekat referensi. */
export const DEFAULT_IMG2IMG_STRENGTH = 0.6;
/** Default 10 langkah (docs default 20) — kompromi latensi cron vs kualitas. */
export const DEFAULT_IMG2IMG_NUM_STEPS = 10;
export const IMG2IMG_MAX_NUM_STEPS = 20;
export const IMG2IMG_MIN_DIMENSION = 256;
export const IMG2IMG_MAX_DIMENSION = 2048;

/** Batas upload referensi (5MB → b64 ~6.7MB, masih dalam timeout 60s). */
export const REFERENCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Dimensi default img2img per aspek (sejajar mapping Pixazo). */
export const IMG2IMG_ASPECT_DIMS: Record<ImageAspect, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 864 },
  '3:4': { width: 864, height: 1152 }
};

export function isImg2ImgModel(modelId: string): boolean {
  return (SUPPORTED_IMG2IMG_MODELS as readonly string[]).includes(modelId.trim());
}

/**
 * Apakah model mendukung image reference? Sumber utama flag
 * `config.supports_reference` (configurable-by-table); fallback ke daftar
 * model img2img dikenal bila flag belum diisi.
 */
export function modelSupportsReference(model: {
  model_id: string;
  config?: Record<string, unknown> | null;
}): boolean {
  const flag = model.config?.['supports_reference'];
  if (flag === true) return true;
  if (flag === false) return false;
  return isImg2ImgModel(model.model_id);
}

/** Clamp strength ke 0–1 (non-number → default). */
export function clampImg2ImgStrength(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_IMG2IMG_STRENGTH;
  return Math.min(1, Math.max(0, n));
}

/** Clamp steps ke int 1–20 (non-number → default). */
export function clampImg2ImgSteps(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_IMG2IMG_NUM_STEPS;
  return Math.min(IMG2IMG_MAX_NUM_STEPS, Math.max(1, n));
}

/** Clamp dimensi ke int 256–2048 (non-number → fallback). */
export function clampImg2ImgDimension(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(IMG2IMG_MAX_DIMENSION, Math.max(IMG2IMG_MIN_DIMENSION, n));
}

/** Kupas prefix `data:mime;base64,` bila ada → base64 mentah untuk `image_b64`. */
export function stripDataUrlPrefix(b64: string): string {
  const idx = b64.indexOf(',');
  if (b64.startsWith('data:') && idx >= 0) return b64.slice(idx + 1).trim();
  return b64.trim();
}

/** Ekstensi aman untuk mime referensi (lempar bila di luar allow-list). */
export function referenceExtensionFor(mime: string): 'jpg' | 'png' | 'webp' {
  const m = (mime ?? '').toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  throw new Error(`tipe file referensi tidak didukung (${mime || 'unknown'}) — pakai JPEG/PNG/WebP`);
}

/** Validasi file referensi sebelum upload (tipe + ukuran). Lempar bila invalid. */
export function assertValidReferenceFile(size: number, mime: string | null | undefined): void {
  if (!mime || !(REFERENCE_IMAGE_ALLOWED_MIME as readonly string[]).includes(mime.toLowerCase())) {
    throw new Error('referensi harus gambar JPEG/PNG/WebP');
  }
  if (!Number.isFinite(size) || size <= 0) throw new Error('file referensi kosong');
  if (size > REFERENCE_IMAGE_MAX_BYTES) throw new Error('referensi maksimal 5MB — kecilkan dulu');
}

/** Bytes → base64 (Node + edge-safe) untuk `image_b64` Cloudflare. */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin);
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
  description?: string;
  negative_prompt?: string | null;
  is_active: boolean;
}

export type ImageMode = 'cover-only' | 'per-reply-opt-in';

export interface ImageGenDefaults {
  id: number;
  provider_id: string | null;
  model_id: string | null;
  style_slug: string | null;
  aspect: ImageAspect;
  image_mode: ImageMode;
}

export interface DraftImageRow {
  id: string;
  draft_id: string;
  /** 0 = main/cover, 1..n = replies (sejajar generated_thread). */
  post_index: number;
  image_prompt: string;
  negative_prompt: string | null;
  /** Reasoning LLM: visual_strategy (after/bridge/custom) + hook_keywords + contradiction_check + justification. */
  reasoning: {
    visual_strategy?: string;
    hook_keywords?: string[];
    contradiction_check?: string;
    justification?: string;
    gate_passed?: boolean;
    gate_retried?: boolean;
  } | null;
  style_slug: string | null;
  /** Camera angle pilihan admin (FK image_camera_angles.slug, auto-append worker). */
  camera_slug: string | null;
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
  /** Kolom img2img (migrasi 20260912000001) — NULL = text-to-image biasa. */
  reference_storage_path: string | null;
  reference_public_url: string | null;
  reference_strength: number | string | null;
}
