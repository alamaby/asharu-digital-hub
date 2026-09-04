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
  const { data, error } = await supabase.from('llm_stage_defaults').select('stage, provider_id, model_id').order('stage');
  if (error) throw new Error(`getStageDefaults: ${error.message}`);
  return (data ?? []) as StageDefaults[];
}

export async function getStageDefault(stage: LLMStage): Promise<StageDefaults | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('llm_stage_defaults').select('stage, provider_id, model_id').eq('stage', stage).maybeSingle();
  if (error) throw new Error(`getStageDefault ${stage}: ${error.message}`);
  return data as StageDefaults | null;
}

/**
 * Resolve provider/model UUIDs for a stage.
 * Priority: session override > stage default > null (global waterfall).
 */
export async function resolveStageModel(
  stage: LLMStage,
  sessionOverrideModelId: string | null | undefined
): Promise<{ providerId: string | null; modelUuid: string | null }> {
  if (sessionOverrideModelId) {
    const supabase = getServiceClient();
    const { data: m } = await supabase.from('llm_models').select('id, provider_id').eq('id', sessionOverrideModelId).maybeSingle();
    const row = m as { id: string; provider_id: string } | null;
    if (row) return { providerId: row.provider_id, modelUuid: row.id };
  }
  const def = await getStageDefault(stage);
  if (def?.model_id) {
    return { providerId: def.provider_id, modelUuid: def.model_id };
  }
  return { providerId: null, modelUuid: null };
}
