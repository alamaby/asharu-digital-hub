import 'server-only';
import { getServiceClient } from '@/lib/supabase/service';
import type { LLMStage } from '@/lib/llm/types';

export interface StageDefaults {
  stage: LLMStage;
  provider_id: string | null;
  model_id: string | null;
}

export async function getStageDefaults(): Promise<StageDefaults[]> {
  const supabase = getServiceClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('llm_stage_defaults').select('stage, provider_id, model_id').order('stage');
  if (error) throw new Error(`getStageDefaults: ${error.message}`);
  return (data ?? []) as StageDefaults[];
}

export async function getStageDefault(stage: LLMStage): Promise<StageDefaults | null> {
  const supabase = getServiceClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('llm_stage_defaults').select('stage, provider_id, model_id').eq('stage', stage).maybeSingle();
  if (error) throw new Error(`getStageDefault ${stage}: ${error.message}`);
  return data as StageDefaults | null;
}

/**
 * Resolve provider/model UUIDs for a stage.
 * Priority: session override > stage default > null (global waterfall).
 * Only returns active models (P0-02, P0-03).
 */
export async function resolveStageModel(
  stage: LLMStage,
  sessionOverrideModelId: string | null | undefined
): Promise<{ providerId: string | null; modelUuid: string | null }> {
  if (sessionOverrideModelId) {
    const supabase = getServiceClient();
    if (!supabase) return { providerId: null, modelUuid: null };
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', sessionOverrideModelId).eq('is_active', true).maybeSingle();
    const row = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (row) return { providerId: row.provider_id, modelUuid: row.id };
  }
  const def = await getStageDefault(stage);
  if (def?.model_id) {
    const supabase = getServiceClient();
    if (!supabase) return { providerId: null, modelUuid: null };
    const { data: m2 } = await supabase.from('llm_models').select('id, is_active').eq('id', def.model_id).eq('is_active', true).maybeSingle();
    const row2 = m2 as { id: string; is_active: boolean } | null;
    if (!row2) return { providerId: null, modelUuid: null };
    return { providerId: def.provider_id, modelUuid: def.model_id };
  }
  return { providerId: null, modelUuid: null };
}
