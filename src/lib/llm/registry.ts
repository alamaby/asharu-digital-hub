import type { ModelRow, ProviderRow } from './types';
import { getServiceClient } from '@/lib/supabase/service';

/**
 * ProviderRegistry — DB-driven, no hardcode.
 * Order is `ORDER BY priority ASC` so admin can reorder via Dashboard.
 */
export class ProviderRegistry {
  async listActive(): Promise<ProviderRow[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('llm_providers')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true });
    if (error) throw new Error(`listActive providers: ${error.message}`);
    return (data ?? []) as unknown as ProviderRow[];
  }

  async getBySlug(slug: string): Promise<ProviderRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('llm_providers')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(`getBySlug ${slug}: ${error.message}`);
    return data as unknown as ProviderRow | null;
  }

  async listModels(providerId: string): Promise<ModelRow[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('llm_models')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('last_used_at', { ascending: true, nullsFirst: true });
    if (error) throw new Error(`listModels: ${error.message}`);
    return (data ?? []) as unknown as ModelRow[];
  }
}
