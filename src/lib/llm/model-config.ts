/**
 * ModelParams — baca knob LLM dari `llm_models.config` (configurable by table).
 * Semua provider + admin UI membaca/menulis lewat modul ini agar konsisten.
 *
 * Keys config yang didukung:
 * - reasoning: boolean — master switch. `false` mematikan semua reasoning.
 * - reasoning_effort: 'max' | 'high' | 'medium' | 'low'
 * - thinking_budget: number (Gemini 2.5-style, override eksplisit)
 * - thinking_level: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' (Gemini 3-style, override eksplisit)
 * - temperature: number (fallback bila request tidak set)
 * - max_tokens: number (fallback bila request tidak set)
 */

export type ReasoningEffort = 'max' | 'high' | 'medium' | 'low';

export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['max', 'high', 'medium', 'low'] as const;

export interface ModelParams {
  reasoningEffort?: ReasoningEffort;
  thinkingBudget?: number;
  thinkingLevel?: string;
  temperature?: number;
  maxTokens?: number;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function isEffort(v: string): v is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(v);
}

/**
 * Resolve knob runtime dari jsonb `llm_models.config`.
 * Nilai tak-valid diabaikan (fail-open ke default provider) — tidak throw.
 */
export function resolveModelParams(config: Record<string, unknown> | null): ModelParams {
  if (!config) return {};
  const params: ModelParams = {};
  if (config.reasoning !== false) {
    const eff = str(config.reasoning_effort) ?? str(config.reasoningEffort);
    if (eff && isEffort(eff)) {
      params.reasoningEffort = eff;
    } else if (config.reasoning === true) {
      params.reasoningEffort = 'max';
    }
  }
  const budget = num(config.thinking_budget) ?? num(config.thinkingBudget);
  if (budget !== undefined && budget > 0) params.thinkingBudget = Math.floor(budget);
  const level = str(config.thinking_level) ?? str(config.thinkingLevel);
  if (level) params.thinkingLevel = level.toUpperCase();
  const temp = num(config.temperature);
  if (temp !== undefined) params.temperature = temp;
  const maxT = num(config.max_tokens) ?? num(config.maxTokens);
  if (maxT !== undefined && maxT > 0) params.maxTokens = Math.floor(maxT);
  return params;
}

/** Mapping effort → Gemini thinkingLevel (model 3.x). */
const EFFORT_TO_LEVEL: Record<ReasoningEffort, string> = {
  max: 'HIGH',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW'
};

/**
 * Bangun `generationConfig.thinkingConfig` untuk Gemini generateContent.
 * Prioritas: thinking_level eksplisit > thinking_budget eksplisit > mapping effort.
 * Satu key saja — API 3.x pakai thinkingLevel, 2.5 pakai thinkingBudget.
 * Tanpa reasoning → undefined (jangan kirim, hemat + aman untuk varian lite).
 */
export function buildThinkingConfig(params: ModelParams): Record<string, unknown> | undefined {
  if (params.thinkingLevel) return { thinkingLevel: params.thinkingLevel };
  if (params.thinkingBudget !== undefined) return { thinkingBudget: params.thinkingBudget };
  if (params.reasoningEffort) return { thinkingLevel: EFFORT_TO_LEVEL[params.reasoningEffort] };
  return undefined;
}

/**
 * Stage ber-output JSON pendek (ide, prompt gambar, skor, verifikasi).
 * Thinking dalam (max/high) menghabiskan maxOutputTokens kecil (500–900) —
 * teks terlihat terpotong tengah kalimat dengan finishReason MAX_TOKENS.
 * Cap effort ke 'low' untuk stage ini; developing/discovering tidak dicap.
 */
export const LOW_EFFORT_STAGES: readonly string[] = [
  'idea_generation',
  'image_prompt',
  'enhance_image_prompt',
  'scoring',
  'verifying',
  'regen_affiliate'
] as const;

export function capEffortForStage(params: ModelParams, stage: string | undefined | null): ModelParams {
  if (!stage || !LOW_EFFORT_STAGES.includes(stage)) return params;
  // Konfigurasi eksplisit (level/budget) menang — hanya cap mapping effort.
  if (params.thinkingLevel || params.thinkingBudget !== undefined) return params;
  if (!params.reasoningEffort || params.reasoningEffort === 'low') return params;
  return { ...params, reasoningEffort: 'low' };
}

/** finishReason yang berarti output dipenggal limit token, bukan berhenti wajar. */
export function isLengthCutoff(finishReason: string | null | undefined): boolean {
  if (!finishReason) return false;
  return /^(MAX_TOKENS|LENGTH|length)$/i.test(finishReason.trim());
}
