import { createClient } from '@supabase/supabase-js';
import type { ProviderRow } from './types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

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
}
