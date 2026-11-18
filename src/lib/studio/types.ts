/** Tipe domain Studio generate image (user login) — configurable by table. */

export type StudioImageStatus = 'pending' | 'ready' | 'failed';

/**
 * Fase siklus hidup diskrit Studio Generation.
 * Memisahkan status antrean DB 'pending' menjadi fase konkret:
 * - 'queued': Baru dimasukkan ke antrean FIFO, belum diambil oleh worker (attempts = 0).
 * - 'processing': Sedang aktif dieksekusi oleh worker ke provider GPU image (attempts > 0, claim masih segar).
 * - 'ready': Berhasil di-generate dan tersimpan di storage CDN.
 * - 'failed': Gagal permanen setelah percobaan atau error non-retryable.
 * - 'stuck': Batas percobaan habis (attempts >= max) akibat tick worker terputus, butuh intervensi/reaper.
 */
export type StudioPhase = 'queued' | 'processing' | 'ready' | 'failed' | 'stuck';

/**
 * Durasi default (menit) klaim worker dianggap aktif sebelum dianggap stale.
 * Alasan bisnis: Invocation serverless image worker memiliki maxDuration 180s (3 menit).
 * Memberikan window 10 menit memberi toleransi 3x durasi invocation agar tick worker paralel
 * tidak merebut pekerjaan yang sedang aktif dirender oleh GPU provider lain.
 */
export const STUDIO_PROCESSING_TIMEOUT_MINUTES = 10;

/**
 * Menghitung fase siklus hidup eksplisit untuk baris generate studio.
 *
 * Alasan Bisnis:
 * Constraint basis data PostgreSQL CHECK (status IN ('pending', 'ready', 'failed'))
 * tidak boleh diubah sembarangan tanpa migrasi skema. Fungsi ini memberikan view
 * state machine diskrit tanpa melanggar skema DB dan tanpa downtime:
 * 1. Menghindarkan pengguna dari ketidakpastian label "Menunggu" saat GPU sebenarnya sedang aktif merender.
 * 2. Mengizinkan agen AI membedakan antrean pasif dari proses yang sedang aktif berjalan.
 */
export function resolveStudioPhase(
  row: {
    status: StudioImageStatus;
    attempts?: number | null;
    updated_at?: string | null;
    llm_meta?: Record<string, unknown> | null;
  },
  now = Date.now(),
  timeoutMinutes = STUDIO_PROCESSING_TIMEOUT_MINUTES
): StudioPhase {
  if (row.status === 'ready') return 'ready';
  if (row.status === 'failed') return 'failed';

  const attempts = row.attempts ?? 0;
  if (attempts >= 3) return 'stuck';

  if (attempts > 0) {
    const lastUpdated = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    const windowMs = timeoutMinutes * 60 * 1000;
    if (now - lastUpdated < windowMs) {
      return 'processing';
    }
  }

  return 'queued';
}

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
  /** Batas prompt per batch (`/studio/batch`). */
  max_batch_prompts: number;
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
  polling_interval_sec: 10,
  max_batch_prompts: 50
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
  /** Grup batch (`/studio/batch`) — NULL = generate single. */
  batch_id: string | null;
  /** Kolom img2img (migrasi 20260912000001) — NULL = text-to-image biasa. */
  reference_storage_path: string | null;
  reference_public_url: string | null;
  reference_strength: number | string | null;
  /** Kolom advanced (migrasi 20260919000001) — NULL = Auto/default model. */
  guidance: number | string | null;
  steps: number | null;
  seed: number | string | null;
  req_width: number | null;
  req_height: number | null;
  /** Snapshot prompt final terkirim ke model (migrasi 20260918000004) — NULL = pending / data lama. */
  final_prompt: string | null;
  final_negative: string | null;
}

export interface StudioModelOption {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  provider_slug: string;
  /** True bila model mendukung image reference (config.supports_reference). */
  supports_reference: boolean;
  /** True bila model merender teks visual akurat (Phoenix/Lucid). */
  text_capable: boolean;
}

export interface StudioOptions {
  providers: { id: string; slug: string; display_name: string }[];
  models: StudioModelOption[];
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
  /** Selalu terisi — gate enhance Studio menolak negative kosong. */
  negative_prompt: string;
  reasoning: {
    visual_strategy: string;
    hook_keywords?: string[];
    contradiction_check?: string;
    justification?: string;
  };
  /** Rekomendasi picker dari LLM; null = biarkan Auto. Sudah divalidasi ke slug aktif. */
  style_slug: string | null;
  subject_slug: string | null;
  camera_slug: string | null;
}

export interface StudioQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
}

// TODO(batch): override per-prompt (mis. [style:...] per blok) — V1 shared saja.
export interface StudioBatch {
  id: string;
  user_id: string;
  name: string | null;
  settings: Record<string, unknown>;
  total: number;
  created_at: string;
}

/** Batch dengan hitung anak (perhitungan dilakukan client-side per-baris). */
export interface StudioBatchWithCounts extends StudioBatch {
  pending: number;
  ready: number;
  failed: number;
}
